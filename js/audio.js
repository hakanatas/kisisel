/* Synthesized audio — no sound files. Engine hum follows speed; impacts
   and zone chimes are short synthesized bursts. Everything is wrapped in
   try/catch so audio can never break the game. */

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem("muted") === "1";
    this.engineOsc = null;
  }

  /* must be called from a user gesture */
  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();

      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);

      // engine: two detuned saws through a lowpass
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 320;
      this.engineGain.connect(lp);
      lp.connect(this.master);
      this.engineOsc = [0, 1].map((i) => {
        const o = this.ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = 50 + i * 2;
        o.connect(this.engineGain);
        o.start();
        return o;
      });

      // shared noise buffer for impacts
      const len = this.ctx.sampleRate * 0.2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    } catch (e) { this.ctx = null; }
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem("muted", this.muted ? "1" : "0");
    if (this.master) this.master.gain.value = this.muted ? 0 : 1;
    return this.muted;
  }

  /* speed01: 0..1 */
  engine(speed01, dt) {
    if (!this.ctx || !this.engineOsc) return;
    try {
      const f = 46 + speed01 * 130;
      this.engineOsc[0].frequency.value = f;
      this.engineOsc[1].frequency.value = f * 1.5 + 3;
      const target = 0.03 + speed01 * 0.075;
      const g = this.engineGain.gain;
      g.value += (target - g.value) * Math.min(1, 8 * dt);
    } catch (e) { /* ignore */ }
  }

  thump(intensity = 1) {
    if (!this.ctx) return;
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      const g = this.ctx.createGain();
      g.gain.value = Math.min(0.35, 0.12 * intensity);
      const f = this.ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 500 + intensity * 300;
      src.connect(f); f.connect(g); g.connect(this.master);
      src.playbackRate.value = 0.7 + Math.random() * 0.5;
      src.start();
    } catch (e) { /* ignore */ }
  }

  chime() {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      [523.25, 783.99].forEach((freq, i) => {
        const o = this.ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = freq;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, t + i * 0.09);
        g.gain.linearRampToValueAtTime(0.12, t + i * 0.09 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.5);
        o.connect(g); g.connect(this.master);
        o.start(t + i * 0.09);
        o.stop(t + i * 0.09 + 0.55);
      });
    } catch (e) { /* ignore */ }
  }
}
