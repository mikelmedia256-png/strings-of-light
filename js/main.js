/* Strings of Light — interactions */
(function () {
  'use strict';

  /* nav background on scroll */
  var nav = document.getElementById('nav');
  var onScroll = function () {
    nav.classList.toggle('stuck', window.scrollY > 40);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* mobile menu — reveals the in-page anchors */
  var burger = document.getElementById('burger');
  var links = document.querySelector('.nav__links');
  burger.addEventListener('click', function () {
    var open = nav.classList.toggle('open');
    burger.setAttribute('aria-expanded', open);
    links.style.display = open ? 'flex' : '';
    if (open) {
      links.style.cssText =
        'display:flex;position:absolute;left:0;right:0;top:100%;flex-direction:column;' +
        'gap:0;background:rgba(12,10,8,.97);backdrop-filter:blur(14px);' +
        'border-block:1px solid var(--line);padding:.5rem 0';
      links.querySelectorAll('a').forEach(function (a) {
        a.style.cssText = 'padding:1rem var(--pad);border-bottom:1px solid var(--line)';
      });
    } else {
      links.style.cssText = '';
    }
  });
  links.addEventListener('click', function (e) {
    if (e.target.tagName === 'A' && nav.classList.contains('open')) burger.click();
  });

  /* click-to-play — swap the poster for a real <video> only on demand,
     so nothing but the hero loop is fetched on page load */
  document.querySelectorAll('.player').forEach(function (p) {
    p.addEventListener('click', function () {
      if (p.dataset.playing) return;
      p.dataset.playing = '1';
      var v = document.createElement('video');
      v.src = p.dataset.src;
      v.controls = true;
      v.autoplay = true;
      v.playsInline = true;
      v.preload = 'auto';
      p.innerHTML = '';
      p.style.cursor = 'default';
      p.appendChild(v);
      v.play().catch(function () { /* user can hit the native control */ });
    });
  });

  /* reveal on scroll — see the CSS note; this is opt-in and fail-safe */
  var els = document.querySelectorAll('.reveal');
  var showAll = function () {
    els.forEach(function (el) { el.classList.add('in'); });
  };
  if ('IntersectionObserver' in window && els.length) {
    document.documentElement.classList.add('reveal-ready');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    els.forEach(function (el) { io.observe(el); });
    /* safety net: if the observer never delivers, show everything anyway */
    setTimeout(function () {
      if (!document.querySelector('.reveal.in')) showAll();
    }, 2500);
  } else {
    showAll();
  }

  /* ----------------------------------------------------------
     Listen bar — a live gold waveform driven by Web Audio.
     Stays hidden until assets/audio/claire-reel.m4a exists, so
     dropping the recording in is the only step needed to enable it.
     ---------------------------------------------------------- */
  (function () {
    var bar = document.getElementById('listen');
    var audio = document.getElementById('reel');
    if (!bar || !audio) return;

    fetch(audio.getAttribute('src'), { method: 'HEAD' })
      .then(function (r) { if (r.ok) init(); })
      .catch(function () { /* no reel yet — bar stays hidden */ });

    function init() {
      var btn = document.getElementById('listenBtn');
      var cvs = document.getElementById('listenWave');
      var ctx = cvs.getContext('2d');
      var actx, analyser, data, raf;

      bar.hidden = false;

      document.getElementById('listenX').addEventListener('click', function () {
        audio.pause();
        bar.hidden = true;
      });

      btn.addEventListener('click', function () {
        if (audio.paused) {
          wire();
          audio.play();
        } else {
          audio.pause();
        }
      });

      audio.addEventListener('play', function () {
        btn.classList.add('playing');
        btn.setAttribute('aria-label', 'Pause audio reel');
        draw();
      });
      ['pause', 'ended'].forEach(function (ev) {
        audio.addEventListener(ev, function () {
          btn.classList.remove('playing');
          btn.setAttribute('aria-label', 'Play audio reel');
          cancelAnimationFrame(raf);
          idle();
        });
      });

      function wire() {
        if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        actx = new AC();
        var src = actx.createMediaElementSource(audio);
        analyser = actx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.72;
        data = new Uint8Array(analyser.frequencyBinCount);
        src.connect(analyser);
        analyser.connect(actx.destination);
      }

      function size() {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var r = cvs.getBoundingClientRect();
        cvs.width = Math.round(r.width * dpr);
        cvs.height = Math.round(r.height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return r;
      }

      /* flat resting line when nothing is playing */
      function idle() {
        var r = size();
        ctx.clearRect(0, 0, r.width, r.height);
        ctx.strokeStyle = 'rgba(201,165,95,.32)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, r.height / 2);
        ctx.lineTo(r.width, r.height / 2);
        ctx.stroke();
      }

      function draw() {
        var r = size();
        ctx.clearRect(0, 0, r.width, r.height);
        if (analyser) {
          analyser.getByteFrequencyData(data);
          var bars = 56;
          var gap = r.width / bars;
          var mid = r.height / 2;
          /* sample logarithmically so the low end doesn't dominate */
          for (var i = 0; i < bars; i++) {
            var idx = Math.floor(Math.pow(i / bars, 1.7) * data.length * 0.7);
            var v = data[idx] / 255;
            var h = Math.max(1, v * (mid - 1));
            var x = i * gap + gap / 2;
            ctx.strokeStyle = 'rgba(228,200,142,' + (0.35 + v * 0.65) + ')';
            ctx.lineWidth = Math.max(1, gap * 0.42);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x, mid - h);
            ctx.lineTo(x, mid + h);
            ctx.stroke();
          }
        }
        raf = requestAnimationFrame(draw);
      }

      idle();
      window.addEventListener('resize', function () { if (audio.paused) idle(); });
    }
  })();


  /* progress bar fallback where scroll-driven animations are unavailable */
  if (!CSS.supports('animation-timeline: scroll()')) {
    var fill = document.querySelector('.prog i');
    if (fill) {
      var tick = function () {
        var max = document.documentElement.scrollHeight - innerHeight;
        fill.style.transform = 'scaleX(' + (max > 0 ? scrollY / max : 0) + ')';
      };
      tick();
      addEventListener('scroll', tick, { passive: true });
      addEventListener('resize', tick);
    }
  }

  /* footer year */
  document.getElementById('yr').textContent = new Date().getFullYear();
})();
