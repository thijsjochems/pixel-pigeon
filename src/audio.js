// Alle geluid wordt gesynthetiseerd met WebAudio. Geen audiobestanden, net als bij
// de texturen: nul laadtijd en elk geluid is een functie die je kunt bijstellen.
//
// Browsers staan geen geluid toe voordat de speler iets heeft aangeraakt, dus de
// AudioContext wordt pas bij de eerste toetsaanslag gemaakt (zie unlock()).

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
  }

  get ready() {
    return !!this.ctx && !this.muted;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
    return this.muted;
  }

  /** Eén toon met een envelope. De bouwsteen voor bijna alles hieronder. */
  tone({ freq = 440, to = null, dur = 0.12, type = 'square', gain = 0.3, delay = 0 }) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    // Korte aanslag, exponentieel uit: dat leest als chiptune in plaats van als piep.
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Ruisburst, voor alles wat plof of ruis moet zijn. */
  noise({ dur = 0.15, gain = 0.25, cutoff = 1200, sweep = null, delay = 0 }) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + delay;
    const frames = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) d[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t);
    if (sweep !== null) filter.frequency.exponentialRampToValueAtTime(Math.max(40, sweep), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
  }

  // --- de eigenlijke geluiden ------------------------------------------

  /** Vleugelklap bij het opstijgen: een droge klap, geen ruisveeg. */
  wingClap() {
    this.noise({ dur: 0.07, gain: 0.32, cutoff: 5000, sweep: 900 });
    this.noise({ dur: 0.09, gain: 0.22, cutoff: 3000, sweep: 400, delay: 0.05 });
    this.tone({ freq: 180, to: 90, dur: 0.12, type: 'triangle', gain: 0.12 });
  }

  /** Koeren. Twee lage, licht wiegende tonen. */
  coo() {
    this.tone({ freq: 300, to: 250, dur: 0.22, type: 'sine', gain: 0.16 });
    this.tone({ freq: 250, to: 290, dur: 0.26, type: 'sine', gain: 0.14, delay: 0.2 });
    this.tone({ freq: 230, to: 200, dur: 0.3, type: 'sine', gain: 0.12, delay: 0.44 });
  }

  /** Fanfare bij CHEEKY PIGEON TIME. */
  cheeky() {
    const notes = [392, 523, 659, 784, 1047, 1319];
    notes.forEach((f, i) => {
      this.tone({ freq: f, dur: 0.14, type: 'square', gain: 0.2, delay: i * 0.06 });
      this.tone({ freq: f * 1.5, dur: 0.1, type: 'triangle', gain: 0.1, delay: i * 0.06 });
    });
  }

  /** Aflopende toon als de power-up eindigt. */
  cheekyEnd() {
    this.tone({ freq: 880, to: 220, dur: 0.5, type: 'triangle', gain: 0.18 });
  }

  /** Kort, zacht tikje zodra je richtring op een doel valt. */
  lockOn() {
    this.tone({ freq: 1500, dur: 0.035, type: 'square', gain: 0.07 });
  }

  flap() {
    // Luchtverplaatsing: ruis die van hoog naar laag veegt.
    this.noise({ dur: 0.16, gain: 0.14, cutoff: 2600, sweep: 500 });
  }

  drop() {
    this.tone({ freq: 700, to: 200, dur: 0.1, type: 'triangle', gain: 0.16 });
  }

  splat() {
    this.noise({ dur: 0.13, gain: 0.22, cutoff: 900, sweep: 120 });
  }

  /** Treffer. Hoger naarmate de combo oploopt, zodat een reeks hoorbaar opbouwt. */
  hit(multiplier = 1, snipe = false) {
    const step = Math.min(multiplier - 1, 7);
    const base = 330 * Math.pow(2, step / 7); // een octaaf over de hele combo
    this.noise({ dur: 0.12, gain: 0.3, cutoff: 1600, sweep: 200 });
    this.tone({ freq: base, to: base * 1.5, dur: 0.1, type: 'square', gain: 0.22 });
    this.tone({ freq: base * 1.5, to: base * 2, dur: 0.12, type: 'square', gain: 0.18, delay: 0.06 });
    if (snipe) {
      this.tone({ freq: base * 3, dur: 0.18, type: 'sawtooth', gain: 0.16, delay: 0.12 });
    }
  }

  pickup() {
    this.tone({ freq: 880, dur: 0.06, type: 'square', gain: 0.14 });
    this.tone({ freq: 1320, dur: 0.08, type: 'square', gain: 0.12, delay: 0.05 });
  }

  alarm() {
    for (let i = 0; i < 3; i++) {
      this.tone({ freq: 720, dur: 0.09, type: 'square', gain: 0.08, delay: i * 0.18 });
      this.tone({ freq: 540, dur: 0.09, type: 'square', gain: 0.08, delay: i * 0.18 + 0.09 });
    }
  }

  bump() {
    this.noise({ dur: 0.2, gain: 0.28, cutoff: 400, sweep: 80 });
    this.tone({ freq: 120, to: 60, dur: 0.16, type: 'sawtooth', gain: 0.18 });
  }

  bonus() {
    this.tone({ freq: 660, dur: 0.07, type: 'triangle', gain: 0.16 });
    this.tone({ freq: 990, dur: 0.09, type: 'triangle', gain: 0.14, delay: 0.06 });
  }

  /** Tik in de laatste tien seconden. De laatste drie klinken hoger en harder. */
  tick(urgent = false) {
    this.tone({
      freq: urgent ? 1200 : 800,
      dur: 0.05,
      type: 'square',
      gain: urgent ? 0.2 : 0.1,
    });
  }

  start() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this.tone({ freq: f, dur: 0.12, type: 'square', gain: 0.16, delay: i * 0.07 }));
  }

  gameover() {
    const notes = [784, 659, 523, 392];
    notes.forEach((f, i) => this.tone({ freq: f, dur: 0.28, type: 'triangle', gain: 0.2, delay: i * 0.14 }));
  }

  record() {
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((f, i) => this.tone({ freq: f, dur: 0.16, type: 'square', gain: 0.18, delay: i * 0.08 }));
  }
}
