/* ============================================================
   GUERRE DES MARQUES — Effets sonores synthétisés (Web Audio)
   Aucun fichier audio externe : tout est généré à la volée.
   ============================================================ */
(function (root) {
  'use strict';

  const SFX = {
    enabled: true,
    _ctx: null,
    _master: null,

    init: function () {
      if (this._ctx) return this._ctx;
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) { this.enabled = false; return null; }
      this._ctx = new AC();
      this._master = this._ctx.createGain();
      this._master.gain.value = 0.5;
      this._master.connect(this._ctx.destination);
      return this._ctx;
    },

    resume: function () {
      const ctx = this.init();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },

    setEnabled: function (on) {
      this.enabled = !!on;
      if (this.enabled) this.resume();
    },

    toggle: function () {
      this.setEnabled(!this.enabled);
      return this.enabled;
    },

    /* --- primitives --- */
    _tone: function (opts) {
      const ctx = this.init();
      if (!ctx || !this.enabled) return;
      const t0 = ctx.currentTime + (opts.delay || 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = opts.type || 'sine';
      osc.frequency.setValueAtTime(opts.from, t0);
      if (opts.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t0 + opts.dur);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(opts.vol || 0.25, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
      osc.connect(gain).connect(this._master);
      osc.start(t0);
      osc.stop(t0 + opts.dur + 0.05);
    },

    _noise: function (opts) {
      const ctx = this.init();
      if (!ctx || !this.enabled) return;
      opts = opts || {};
      const dur = opts.dur || 0.18;
      const t0 = ctx.currentTime + (opts.delay || 0);
      const len = Math.floor(ctx.sampleRate * dur);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = opts.filter || 'bandpass';
      filter.frequency.value = opts.freq || 900;
      filter.Q.value = opts.q || 1.1;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(opts.vol || 0.3, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter).connect(gain).connect(this._master);
      src.start(t0);
    },

    /* --- effets du jeu --- */
    play: function (name) {
      if (!this.enabled) return;
      switch (name) {
        case 'click':
          this._tone({ type: 'triangle', from: 620, to: 880, dur: 0.07, vol: 0.12 });
          break;
        case 'round':
          this._tone({ type: 'square', from: 420, to: 640, dur: 0.14, vol: 0.14 });
          this._tone({ type: 'square', from: 640, to: 900, dur: 0.16, vol: 0.12, delay: 0.13 });
          break;
        case 'swing':
          this._noise({ dur: 0.14, freq: 1800, q: 0.8, vol: 0.14 });
          break;
        case 'hit':
          this._noise({ dur: 0.2, freq: 700, q: 1.4, vol: 0.34 });
          this._tone({ type: 'sine', from: 220, to: 70, dur: 0.22, vol: 0.3 });
          break;
        case 'crit':
          this._noise({ dur: 0.3, freq: 1500, q: 0.7, vol: 0.4 });
          this._tone({ type: 'sawtooth', from: 900, to: 180, dur: 0.34, vol: 0.3 });
          this._tone({ type: 'square', from: 1400, to: 300, dur: 0.22, vol: 0.16, delay: 0.04 });
          break;
        case 'dodge':
          this._tone({ type: 'sine', from: 1100, to: 1800, dur: 0.16, vol: 0.14 });
          break;
        case 'block':
          this._noise({ dur: 0.26, freq: 320, q: 2.2, vol: 0.3, filter: 'lowpass' });
          this._tone({ type: 'square', from: 180, to: 120, dur: 0.2, vol: 0.16 });
          break;
        case 'heal':
          [523, 659, 784].forEach((f, i) => this._tone({ type: 'sine', from: f, to: f * 1.01, dur: 0.22, vol: 0.16, delay: i * 0.07 }));
          break;
        case 'buff':
          [392, 523, 659, 880].forEach((f, i) => this._tone({ type: 'triangle', from: f, to: f, dur: 0.18, vol: 0.14, delay: i * 0.055 }));
          break;
        case 'special':
          this._tone({ type: 'sawtooth', from: 180, to: 1200, dur: 0.42, vol: 0.2 });
          this._tone({ type: 'square', from: 1200, to: 240, dur: 0.3, vol: 0.16, delay: 0.4 });
          this._noise({ dur: 0.4, freq: 2400, q: 0.6, vol: 0.16, delay: 0.32 });
          break;
        case 'stun':
          this._tone({ type: 'square', from: 700, to: 90, dur: 0.5, vol: 0.2 });
          break;
        case 'ultReady':
          [659, 880, 1318].forEach((f, i) => this._tone({ type: 'triangle', from: f, to: f, dur: 0.22, vol: 0.13, delay: i * 0.07 }));
          break;
        case 'ultimate':
          this._tone({ type: 'sawtooth', from: 110, to: 1800, dur: 0.85, vol: 0.2 });
          this._noise({ dur: 0.5, freq: 2600, q: 0.5, vol: 0.14, delay: 0.2 });
          this._tone({ type: 'square', from: 420, to: 55, dur: 0.8, vol: 0.22, delay: 0.6 });
          this._noise({ dur: 0.9, freq: 700, q: 0.6, vol: 0.34, delay: 0.58, filter: 'lowpass' });
          [392, 523, 659, 784, 1046].forEach((f, i) => this._tone({ type: 'triangle', from: f, to: f, dur: 0.5, vol: 0.15, delay: 0.62 + i * 0.06 }));
          break;
        case 'ko':
          this._noise({ dur: 0.7, freq: 260, q: 0.8, vol: 0.4, filter: 'lowpass' });
          this._tone({ type: 'sawtooth', from: 320, to: 40, dur: 1.1, vol: 0.34 });
          this._tone({ type: 'square', from: 140, to: 30, dur: 1.3, vol: 0.2, delay: 0.1 });
          break;
        case 'win':
          [523, 659, 784, 1046].forEach((f, i) => this._tone({ type: 'triangle', from: f, to: f, dur: 0.34, vol: 0.2, delay: i * 0.13 }));
          break;
        case 'lose':
          [440, 349, 262, 196].forEach((f, i) => this._tone({ type: 'sine', from: f, to: f * 0.98, dur: 0.4, vol: 0.18, delay: i * 0.16 }));
          break;
        default:
          break;
      }
    }
  };

  root.SFX = SFX;
})(typeof self !== 'undefined' ? self : this);
