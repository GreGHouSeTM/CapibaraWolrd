// Sons et musiques entièrement synthétisés (WebAudio) : aucune ressource externe.
import type { RegionId } from '../world/layout';

type Inst = 'pluck' | 'bell' | 'accordion' | 'epiano' | 'musicbox' | 'oud' | 'celesta';

interface MusicStyle {
  bpm: number;
  beats: number; // temps par mesure
  scale: number[]; // demi-tons
  root: number; // note MIDI
  chords: number[][]; // degrés
  lead: Inst;
  pad: Inst;
  swing?: number;
}

const STYLES: Record<RegionId, MusicStyle> = {
  hub: { bpm: 96, beats: 4, scale: [0, 2, 4, 7, 9], root: 60, chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [3, 5, 7]], lead: 'pluck', pad: 'pluck' },
  paris: { bpm: 132, beats: 3, scale: [0, 2, 3, 5, 7, 8, 11], root: 57, chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [0, 2, 4]], lead: 'accordion', pad: 'pluck' },
  newyork: { bpm: 104, beats: 4, scale: [0, 2, 3, 5, 7, 9, 10], root: 55, chords: [[1, 3, 5, 7], [4, 6, 8, 10], [0, 2, 4, 6], [5, 7, 9, 11]], lead: 'epiano', pad: 'epiano', swing: 0.18 },
  london: { bpm: 100, beats: 4, scale: [0, 2, 4, 5, 7, 9, 11], root: 62, chords: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [4, 6, 8]], lead: 'musicbox', pad: 'pluck' },
  japan: { bpm: 80, beats: 4, scale: [0, 2, 3, 7, 8], root: 62, chords: [[0, 2, 4], [3, 5, 7], [1, 3, 5], [0, 2, 4]], lead: 'bell', pad: 'bell' },
  desert: { bpm: 92, beats: 4, scale: [0, 1, 4, 5, 7, 8, 10], root: 57, chords: [[0, 2, 4], [1, 3, 5], [0, 2, 4], [6, 8, 10]], lead: 'oud', pad: 'pluck' },
  pole: { bpm: 88, beats: 4, scale: [0, 2, 4, 5, 7, 9, 11], root: 65, chords: [[0, 2, 4], [3, 5, 7], [5, 7, 9], [4, 6, 8]], lead: 'celesta', pad: 'celesta' },
};

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioSystem {
  ctx: AudioContext | null = null;
  master!: GainNode;
  music!: GainNode;
  sfx!: GainNode;
  private noiseBuf!: AudioBuffer;
  private engine: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private wind: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private hum: { gain: GainNode } | null = null;
  private region: RegionId = 'hub';
  private nextBeat = 0;
  private beat = 0;
  private bar = 0;
  private lastMelody = 0;
  volMusic = 0.5;
  volSfx = 0.8;
  private birdT = 2;

  init() {
    if (this.ctx) return;
    const C = window.AudioContext || (window as any).webkitAudioContext;
    if (!C) return;
    this.ctx = new C();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0.8;
    const comp = c.createDynamicsCompressor();
    this.master.connect(comp).connect(c.destination);
    this.music = c.createGain();
    this.music.gain.value = this.volMusic * 0.35;
    this.sfx = c.createGain();
    this.sfx.gain.value = this.volSfx;
    // réverbération légère pour la musique
    const conv = c.createConvolver();
    conv.buffer = this.impulse(2.2);
    const wet = c.createGain();
    wet.gain.value = 0.35;
    this.music.connect(this.master);
    this.music.connect(conv).connect(wet).connect(this.master);
    this.sfx.connect(this.master);
    this.noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // vent / ambiance
    const n = this.noise(true);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 500;
    f.Q.value = 0.6;
    const g = c.createGain();
    g.gain.value = 0;
    n.connect(f).connect(g).connect(this.sfx);
    n.start();
    this.wind = { gain: g, filter: f };
    const n2 = this.noise(true);
    const lf = c.createBiquadFilter();
    lf.type = 'lowpass';
    lf.frequency.value = 220;
    const hg = c.createGain();
    hg.gain.value = 0;
    n2.connect(lf).connect(hg).connect(this.sfx);
    n2.start();
    this.hum = { gain: hg };
    this.nextBeat = c.currentTime + 0.3;
  }

  resume() {
    this.ctx?.resume();
  }

  setVolumes(music: number, sfx: number) {
    this.volMusic = music;
    this.volSfx = sfx;
    if (!this.ctx) return;
    this.music.gain.value = music * 0.35;
    this.sfx.gain.value = sfx;
  }

  private impulse(sec: number) {
    const c = this.ctx!;
    const len = c.sampleRate * sec;
    const b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return b;
  }

  private noise(loop = false) {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = loop;
    return s;
  }

  private env(g: GainNode, t: number, a: number, peak: number, dec: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  private tone(freq: number, t: number, dur: number, type: OscillatorType, vol: number, dest: AudioNode, glide?: number) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
    const g = c.createGain();
    this.env(g, t, 0.005, vol, dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------------ effets
  play(name: 'step' | 'jump' | 'splash' | 'coin' | 'success' | 'horn' | 'bump' | 'click' | 'photo' | 'door' | 'checkpoint' | 'whoosh', opt = 1) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    switch (name) {
      case 'step': {
        const n = this.noise();
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 600 + Math.random() * 500;
        const g = c.createGain();
        this.env(g, t, 0.004, 0.12 * opt, 0.07);
        n.connect(f).connect(g).connect(this.sfx);
        n.start(t, Math.random());
        n.stop(t + 0.1);
        break;
      }
      case 'jump': this.tone(300, t, 0.2, 'sine', 0.2, this.sfx, 650); break;
      case 'splash': {
        const n = this.noise();
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(2500, t);
        f.frequency.exponentialRampToValueAtTime(300, t + 0.6);
        const g = c.createGain();
        this.env(g, t, 0.01, 0.4, 0.6);
        n.connect(f).connect(g).connect(this.sfx);
        n.start(t);
        n.stop(t + 0.7);
        break;
      }
      case 'coin':
        this.tone(988, t, 0.1, 'square', 0.08, this.sfx);
        this.tone(1319, t + 0.08, 0.3, 'square', 0.08, this.sfx);
        break;
      case 'checkpoint':
        this.tone(784, t, 0.12, 'triangle', 0.25, this.sfx);
        this.tone(1175, t + 0.1, 0.25, 'triangle', 0.25, this.sfx);
        break;
      case 'success': {
        const notes = [523, 659, 784, 1047, 784, 1047];
        notes.forEach((f, i) => this.tone(f, t + i * 0.11, i === notes.length - 1 ? 0.8 : 0.2, 'triangle', 0.25, this.sfx));
        break;
      }
      case 'horn':
        this.tone(392, t, 0.35, 'square', 0.1, this.sfx);
        this.tone(494, t, 0.35, 'square', 0.08, this.sfx);
        break;
      case 'bump': this.tone(120, t, 0.25, 'sine', 0.4 * opt, this.sfx, 50); break;
      case 'click': this.tone(1200, t, 0.05, 'sine', 0.1, this.sfx); break;
      case 'door': this.tone(220, t, 0.15, 'triangle', 0.15, this.sfx, 330); break;
      case 'whoosh': {
        const n = this.noise();
        const f = c.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.setValueAtTime(300, t);
        f.frequency.exponentialRampToValueAtTime(3000, t + 0.5);
        const g = c.createGain();
        this.env(g, t, 0.1, 0.3, 0.5);
        n.connect(f).connect(g).connect(this.sfx);
        n.start(t);
        n.stop(t + 0.7);
        break;
      }
      case 'photo': {
        const n = this.noise();
        const g = c.createGain();
        this.env(g, t, 0.002, 0.3, 0.08);
        n.connect(g).connect(this.sfx);
        n.start(t);
        n.stop(t + 0.1);
        this.tone(2000, t + 0.1, 0.05, 'square', 0.05, this.sfx);
        break;
      }
    }
  }

  // ------------------------------------------------------------------ moteur
  setEngine(on: boolean, speed01: number, kind: 'car' | 'boat' | 'snow' | 'bus' | 'scooter' = 'car') {
    const c = this.ctx;
    if (!c) return;
    if (on && !this.engine) {
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      const osc2 = c.createOscillator();
      osc2.type = 'square';
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;
      const gain = c.createGain();
      gain.gain.value = 0;
      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(gain).connect(this.sfx);
      osc.start();
      osc2.start();
      this.engine = { osc, osc2, gain, filter };
    }
    if (!this.engine) return;
    const e = this.engine;
    const t = c.currentTime;
    if (!on) {
      e.gain.gain.setTargetAtTime(0, t, 0.1);
      return;
    }
    const base = kind === 'scooter' ? 70 : kind === 'bus' ? 32 : kind === 'boat' ? 45 : kind === 'snow' ? 60 : 48;
    const f = base + speed01 * base * 2.2;
    e.osc.frequency.setTargetAtTime(f, t, 0.08);
    e.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.08);
    e.filter.frequency.setTargetAtTime(300 + speed01 * 900, t, 0.1);
    e.gain.gain.setTargetAtTime(0.05 + speed01 * 0.06, t, 0.1);
  }

  // ------------------------------------------------------------------ ambiance + musique
  update(region: RegionId, night: number, nearWater: boolean, look: 'city' | 'nature') {
    const c = this.ctx;
    if (!c) return;
    this.region = region;
    const t = c.currentTime;
    if (this.wind) {
      const base = region === 'pole' ? 0.035 : region === 'desert' ? 0.022 : 0;
      const gust = 0.5 + 0.5 * Math.sin(t * 0.21) * Math.sin(t * 0.13 + 1.7);
      this.wind.gain.gain.setTargetAtTime(base * gust + (nearWater ? 0.006 : 0), t, 1.5);
      this.wind.filter.frequency.setTargetAtTime(region === 'pole' ? 800 : nearWater ? 350 : 500, t, 1);
    }
    if (this.hum) this.hum.gain.gain.setTargetAtTime(look === 'city' ? 0.012 : 0, t, 1.5);
    // oiseaux le jour à la campagne
    this.birdT -= 1 / 60;
    if (this.birdT < 0) {
      this.birdT = 1.5 + Math.random() * 4;
      if (look === 'nature' && night < 0.4 && region !== 'pole') this.bird();
    }
    // séquenceur musical (anticipation de 0.2 s)
    const st = STYLES[this.region];
    const spb = 60 / st.bpm / 2; // croches
    while (this.nextBeat < t + 0.2) {
      this.musicStep(st, this.nextBeat, spb);
      const swing = st.swing && this.beat % 2 === 0 ? spb * st.swing : st.swing ? -spb * st.swing : 0;
      this.nextBeat += spb + swing;
      this.beat++;
      if (this.beat >= st.beats * 2) { this.beat = 0; this.bar++; }
    }
  }

  private bird() {
    const c = this.ctx!;
    const t = c.currentTime;
    const n = 2 + Math.floor(Math.random() * 4);
    const base = 2400 + Math.random() * 1500;
    for (let i = 0; i < n; i++) this.tone(base, t + i * 0.12, 0.08, 'sine', 0.03, this.sfx, base * (1.2 + Math.random() * 0.3));
  }

  private note(inst: Inst, midi: number, t: number, dur: number, vol: number) {
    const c = this.ctx!;
    const f = mtof(midi);
    const out = this.music;
    switch (inst) {
      case 'pluck': this.tone(f, t, dur, 'triangle', vol, out); break;
      case 'bell':
        this.tone(f, t, dur * 2.5, 'sine', vol, out);
        this.tone(f * 2.76, t, dur * 0.8, 'sine', vol * 0.25, out);
        break;
      case 'celesta':
        this.tone(f * 2, t, dur * 2, 'sine', vol * 0.8, out);
        this.tone(f * 4, t, dur * 0.6, 'sine', vol * 0.2, out);
        break;
      case 'musicbox':
        this.tone(f * 2, t, dur * 1.5, 'sine', vol, out);
        this.tone(f * 6, t, 0.1, 'sine', vol * 0.15, out);
        break;
      case 'epiano':
        this.tone(f, t, dur * 1.8, 'sine', vol, out);
        this.tone(f * 2, t, dur * 0.5, 'triangle', vol * 0.2, out);
        break;
      case 'oud': {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        const fl = c.createBiquadFilter();
        fl.type = 'lowpass';
        fl.frequency.setValueAtTime(3000, t);
        fl.frequency.exponentialRampToValueAtTime(400, t + dur);
        const g = c.createGain();
        this.env(g, t, 0.003, vol * 0.6, dur);
        o.connect(fl).connect(g).connect(out);
        o.start(t);
        o.stop(t + dur + 0.05);
        break;
      }
      case 'accordion': {
        for (const det of [-4, 4]) {
          const o = c.createOscillator();
          o.type = 'square';
          o.frequency.value = f;
          o.detune.value = det;
          const fl = c.createBiquadFilter();
          fl.type = 'lowpass';
          fl.frequency.value = 1600;
          const g = c.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(vol * 0.25, t + 0.04);
          g.gain.setValueAtTime(vol * 0.25, t + dur * 0.8);
          g.gain.linearRampToValueAtTime(0.0001, t + dur);
          o.connect(fl).connect(g).connect(out);
          o.start(t);
          o.stop(t + dur + 0.05);
        }
        break;
      }
    }
  }

  private musicStep(st: MusicStyle, t: number, spb: number) {
    const sc = st.scale;
    const deg = (d: number) => st.root + Math.floor(d / sc.length) * 12 + sc[((d % sc.length) + sc.length) % sc.length];
    const chord = st.chords[this.bar % st.chords.length];
    const stepsPerBar = st.beats * 2;
    // basse sur le premier temps
    if (this.beat === 0) this.note('pluck', deg(chord[0]) - 24, t, spb * stepsPerBar * 0.9, 0.22);
    // accompagnement
    if (st.beats === 3) {
      if (this.beat === 2 || this.beat === 4) for (const c of chord.slice(0, 3)) this.note(st.pad, deg(c) - 12, t, spb * 1.2, 0.07);
    } else if (this.beat % 2 === 0 && this.beat > 0) {
      for (const c of chord) this.note(st.pad, deg(c) - 12, t, spb * 1.6, 0.05);
    }
    // mélodie aléatoire guidée (phrase de 4 mesures, silences fréquents)
    const phrasePos = (this.bar % 8) / 8;
    const rest = Math.random() < (phrasePos > 0.75 ? 0.75 : 0.45);
    if (!rest && (this.beat % 2 === 0 || Math.random() < 0.3)) {
      const target = chord[Math.floor(Math.random() * chord.length)] + 7;
      let next = this.lastMelody + Math.sign(target - this.lastMelody) * (Math.random() < 0.7 ? 1 : 2);
      if (Math.random() < 0.2) next = target;
      next = Math.max(4, Math.min(14, next));
      this.lastMelody = next;
      this.note(st.lead, deg(next), t, spb * (Math.random() < 0.3 ? 3 : 1.6), 0.14);
    }
  }
}
