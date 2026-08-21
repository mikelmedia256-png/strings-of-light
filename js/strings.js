/* ============================================================
   The string field — four plucked strings of light.
   Tuned to the violin's open strings: G3 · D4 · A4 · E5.

   Pointer crossing a string plucks it. Motion is a damped
   standing wave; sound is a short pizzicato synthesised on the
   fly (no samples). Audio stays silent until the visitor opts
   in, so nothing ever makes noise unannounced.
   ============================================================ */
(function () {
  'use strict';

  var host = document.getElementById('stringfield');
  if (!host) return;

  var canvas = host.querySelector('canvas');
  var ctx = canvas.getContext('2d');
  var toggle = document.getElementById('soundToggle');
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* open violin strings, low to high */
  var TUNING = [
    { note: 'G', hz: 196.00 },
    { note: 'D', hz: 293.66 },
    { note: 'A', hz: 440.00 },
    { note: 'E', hz: 659.25 }
  ];

  var W = 0, H = 0, dpr = 1;
  var strings = [];
  var soundOn = false;
  var actx = null;

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var r = host.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var inset = Math.min(120, W * 0.08);
    var span = H * 0.74;
    var top = (H - span) / 2;
    /* uneven spacing: a clearing between the middle two strings so the
       copy sits threaded between them rather than crossed by one */
    var slot = [0, 0.235, 0.765, 1];
    strings = TUNING.map(function (t, i) {
      return {
        note: t.note,
        hz: t.hz,
        x0: inset,
        x1: W - inset,
        y: top + span * slot[i],
        amp: 0,          /* current displacement, px */
        vel: 0,
        phase: 0,
        /* thicker, slower strings at the bottom of the pitch range */
        weight: 1.9 - i * 0.3,
        freq: 5.2 + i * 1.5,
        lastSide: 0,
        glow: 0
      };
    });
  }

  /* ---------- audio ---------- */
  function ensureCtx() {
    if (!actx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }

  /* a short pizzicato: bright attack, fast decay, a little body */
  function pluckSound(hz, strength) {
    if (!soundOn) return;
    var ac = ensureCtx();
    if (!ac) return;
    var t0 = ac.currentTime;
    var dur = 1.9;
    var gain = ac.createGain();
    var filt = ac.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(Math.min(7000, hz * 14), t0);
    filt.frequency.exponentialRampToValueAtTime(Math.max(220, hz * 2.2), t0 + dur * 0.7);
    filt.Q.value = 0.9;

    var peak = Math.min(0.20, 0.05 + strength * 0.11);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    /* fundamental plus a few harmonics — enough to read as a string */
    [[1, 1], [2, 0.42], [3, 0.22], [4, 0.12], [5, 0.07]].forEach(function (h) {
      var o = ac.createOscillator();
      var g = ac.createGain();
      o.type = h[0] === 1 ? 'triangle' : 'sine';
      o.frequency.value = hz * h[0];
      /* a touch of detune keeps it from sounding synthetic */
      o.detune.value = (Math.random() - 0.5) * 6;
      g.gain.value = h[1];
      o.connect(g); g.connect(filt);
      o.start(t0); o.stop(t0 + dur);
    });

    filt.connect(gain); gain.connect(ac.destination);
  }

  /* ---------- plucking ---------- */
  function pluck(s, strength, dir) {
    s.amp = Math.min(26, Math.abs(strength) * 26) * (dir < 0 ? -1 : 1);
    s.vel = 0;
    s.phase = 0;
    s.glow = 1;
    pluckSound(s.hz, Math.min(1, Math.abs(strength)));
  }

  function onMove(px, py, speed) {
    strings.forEach(function (s) {
      if (px < s.x0 - 30 || px > s.x1 + 30) { s.lastSide = 0; return; }
      var side = py < s.y ? -1 : 1;
      if (s.lastSide !== 0 && side !== s.lastSide) {
        pluck(s, 0.35 + Math.min(0.65, speed / 45), side);
      }
      s.lastSide = side;
    });
  }

  var lastX = 0, lastY = 0, lastT = 0;
  host.addEventListener('pointermove', function (e) {
    var r = host.getBoundingClientRect();
    var x = e.clientX - r.left, y = e.clientY - r.top;
    var now = performance.now();
    var dt = Math.max(1, now - lastT);
    var speed = Math.hypot(x - lastX, y - lastY) / dt * 16;
    lastX = x; lastY = y; lastT = now;
    onMove(x, y, speed);
  });
  host.addEventListener('pointerleave', function () {
    strings.forEach(function (s) { s.lastSide = 0; });
  });

  /* tapping / clicking a string plucks it and turns sound on */
  host.addEventListener('pointerdown', function (e) {
    var r = host.getBoundingClientRect();
    var x = e.clientX - r.left, y = e.clientY - r.top;
    var near = null, best = 26;
    strings.forEach(function (s) {
      if (x < s.x0 - 30 || x > s.x1 + 30) return;
      var d = Math.abs(y - s.y);
      if (d < best) { best = d; near = s; }
    });
    if (near) {
      if (!soundOn) setSound(true);
      pluck(near, 0.9, y < near.y ? -1 : 1);
    }
  });

  function setSound(on) {
    soundOn = on;
    if (on) ensureCtx();
    toggle.setAttribute('aria-pressed', String(on));
    toggle.classList.toggle('on', on);
    toggle.querySelector('.sd__t').textContent = on ? 'Sound on' : 'Sound off';
  }
  toggle.addEventListener('click', function () { setSound(!soundOn); });

  /* keyboard: the four strings are focusable buttons in the DOM */
  host.querySelectorAll('[data-string]').forEach(function (btn, i) {
    btn.addEventListener('click', function () {
      if (!soundOn) setSound(true);
      pluck(strings[i], 0.9, -1);
    });
  });

  /* ---------- render ---------- */
  function draw() {
    ctx.clearRect(0, 0, W, H);
    strings.forEach(function (s) {
      /* damped oscillation */
      if (!reduced && Math.abs(s.amp) > 0.05) {
        s.phase += s.freq * 0.045;
        s.amp *= 0.975;
      } else if (reduced) {
        s.amp *= 0.6;
      }
      s.glow *= 0.965;

      var d = s.amp * Math.cos(s.phase);
      var mx = (s.x0 + s.x1) / 2;
      var my = s.y + d;

      /* glow underlay */
      if (s.glow > 0.02) {
        ctx.save();
        ctx.strokeStyle = 'rgba(228,200,142,' + (s.glow * 0.5) + ')';
        ctx.lineWidth = s.weight + 7;
        ctx.filter = 'blur(7px)';
        ctx.beginPath();
        ctx.moveTo(s.x0, s.y);
        ctx.quadraticCurveTo(mx, my + d, s.x1, s.y);
        ctx.stroke();
        ctx.restore();
      }

      var g = ctx.createLinearGradient(s.x0, 0, s.x1, 0);
      g.addColorStop(0, 'rgba(201,165,95,.12)');
      g.addColorStop(0.5, 'rgba(228,200,142,' + (0.55 + s.glow * 0.45) + ')');
      g.addColorStop(1, 'rgba(201,165,95,.12)');
      ctx.strokeStyle = g;
      ctx.lineWidth = s.weight;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s.x0, s.y);
      ctx.quadraticCurveTo(mx, my + d, s.x1, s.y);
      ctx.stroke();
    });
    requestAnimationFrame(draw);
  }

  var ro = new ResizeObserver(layout);
  ro.observe(host);
  layout();
  requestAnimationFrame(draw);
})();
