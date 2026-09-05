// Web Audio engine: tone generation, drums, drone, MIDI export, mic pitch detection.

// ---------- Audio ----------
// Shared tone settings, updated from React state
export const TONE = { drive: false, mute: false };
let audioCtx = null;
let shaper = null;
let droneNodes = null;

export function ensureCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}
export function distortionCurve(amount) {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + amount) * x * 20 * Math.PI) / (Math.PI + amount * Math.abs(x) * 20);
  }
  return curve;
}
export function getShaper() {
  const ctx = ensureCtx();
  if (!shaper) {
    shaper = ctx.createWaveShaper();
    shaper.curve = distortionCurve(28);
    shaper.oversample = "4x";
  }
  return shaper;
}
export function playClick(time, accent, groupAccent) {
  const ctx = ensureCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = accent ? 1750 : groupAccent ? 1400 : 1000;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(accent ? 0.36 : groupAccent ? 0.28 : 0.18, time + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.08);
}

// opts: { drive, mute, gain }
export function playMidi(midi, when = 0, dur = 0.9, opts = {}) {
  try {
    const ctx = ensureCtx();
    if (opts.raw !== true) {
      // real recorded samples first
      if (playSample(midi, when, dur, opts)) return;
      // modelled string while samples are still downloading
      if (!guitar.ready && !guitar.initing) initGuitar();
      if (guitar.ready && pluck(midi, when, opts)) return;
    }
    const drive = opts.drive !== undefined ? opts.drive : TONE.drive;
    const mute = opts.mute !== undefined ? opts.mute : TONE.mute;
    const t0 = ctx.currentTime + when;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const len = mute ? Math.min(dur, 0.16) : dur;

    const gain = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";

    if (drive) {
      // saw pair through a waveshaper: fat, harmonically dense
      const a = ctx.createOscillator(); a.type = "sawtooth"; a.frequency.value = freq;
      const b = ctx.createOscillator(); b.type = "square"; b.frequency.value = freq; b.detune.value = -7;
      const sub = ctx.createOscillator(); sub.type = "sawtooth"; sub.frequency.value = freq / 2;
      const pre = ctx.createGain(); pre.gain.value = 0.5;
      const subG = ctx.createGain(); subG.gain.value = 0.35;
      a.connect(pre); b.connect(pre); sub.connect(subG); subG.connect(pre);
      pre.connect(getShaper());
      getShaper().connect(filt);
      filt.frequency.setValueAtTime(mute ? 1100 : 3200, t0);
      filt.frequency.exponentialRampToValueAtTime(mute ? 420 : 1400, t0 + len);
      filt.Q.value = mute ? 6 : 1.2;
      a.start(t0); b.start(t0); sub.start(t0);
      a.stop(t0 + len + 0.05); b.stop(t0 + len + 0.05); sub.stop(t0 + len + 0.05);
    } else {
      const osc = ctx.createOscillator(); osc.type = "triangle"; osc.frequency.value = freq;
      const osc2 = ctx.createOscillator(); osc2.type = "sawtooth"; osc2.frequency.value = freq; osc2.detune.value = 4;
      const g2 = ctx.createGain(); g2.gain.value = 0.12;
      osc.connect(filt); osc2.connect(g2); g2.connect(filt);
      filt.frequency.setValueAtTime(mute ? 900 : Math.min(freq * 6, 5000), t0);
      filt.frequency.exponentialRampToValueAtTime(mute ? 300 : Math.max(freq * 1.5, 200), t0 + len);
      osc.start(t0); osc2.start(t0);
      osc.stop(t0 + len + 0.05); osc2.stop(t0 + len + 0.05);
    }

    const peak = (opts.gain || 1) * (drive ? 0.2 : 0.26) * (mute ? 1.15 : 1);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + (mute ? 0.003 : 0.008));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    filt.connect(gain);
    gain.connect(ctx.destination);
  } catch (e) { /* audio unavailable */ }
}

export function playChord(pcs, rootPc, dur = 1.6, opts = {}) {
  const rootMidi = 48 + ((rootPc - 3 + 12) % 12);
  const voices = [rootMidi - 12, ...pcs.map((pc) => rootMidi + ((pc - rootPc + 12) % 12)), rootMidi + 12];
  const strum = TONE.mute ? 0.012 : 0.035;
  voices.forEach((m, i) => playMidi(m, i * strum, dur, opts));
}

// Power chord: root + fifth + octave, voiced low
export function playPower(rootPc, dur = 1.2, opts = {}) {
  const rootMidi = 36 + ((rootPc - 3 + 12) % 12);
  [rootMidi, rootMidi + 7, rootMidi + 12].forEach((m, i) => playMidi(m, i * 0.01, dur, opts));
}


// ---------- Guitar engine: physical string model + amp and cab ----------
const KS_WORKLET_SRC = `
// Karplus-Strong extended string model. One processor, many voices.
class StringVoice {
  constructor(sr, freq, opts) {
    const o = opts || {};
    this.sr = sr;
    // loop delay; the averaging lowpass adds ~half a sample of delay
    this.D = Math.max(2, sr / freq - 0.5);
    this.size = Math.ceil(this.D) + 4;
    this.buf = new Float32Array(this.size);
    this.w = 0;
    this.lp = 0;
    this.dead = 0;
    this.vel = o.vel === undefined ? 1 : o.vel;
    const mute = !!o.mute;
    // energy loss per period, converted to a per-sample coefficient
    // the wave passes the loss once per circulation, i.e. once per period
    this.decay = mute ? 0.59 : (o.sustain === undefined ? 0.982 : o.sustain);
    // loop damping: higher = darker; highs die before the fundamental, as on a real string
    this.damp = mute ? 0.62 : 0.28;
    // pick excitation: noise burst, combed by pick position
    const pick = mute ? 0.42 : (o.pickPos === undefined ? 0.14 : o.pickPos);
    const combLen = Math.max(1, Math.round(this.D * pick));
    const n = Math.floor(this.D);
    const raw = new Float32Array(n + combLen + 2);
    let prev = 0;
    for (let i = 0; i < raw.length; i++) {
      // lowpass the noise a little so the attack is not pure fizz
      const white = Math.random() * 2 - 1;
      prev = 0.6 * white + 0.4 * prev;
      raw[i] = prev;
    }
    const tmp = new Float32Array(n);
    let mean = 0;
    for (let i = 0; i < n; i++) { tmp[i] = (raw[i + combLen] - raw[i]) * 0.5 * this.vel; mean += tmp[i]; }
    mean /= n;
    for (let i = 0; i < n; i++) this.buf[i] = tmp[i] - mean; // zero-mean, so no DC drifts in the loop
    // a touch of pick attack noise on top of the string itself
    this.click = mute ? 0.0 : 0.35 * this.vel;
    this.clickN = Math.floor(sr * 0.004);
    this.t = 0;
  }
  process() {
    // fractional read for accurate tuning
    let r = this.w - this.D;
    while (r < 0) r += this.size;
    const i0 = Math.floor(r);
    const fr = r - i0;
    const a = this.buf[i0 % this.size];
    const b = this.buf[(i0 + 1) % this.size];
    const s = a + (b - a) * fr;
    // one-pole lowpass in the feedback path
    this.lp = (1 - this.damp) * s + this.damp * this.lp;
    const out = this.lp * this.decay;
    this.buf[this.w] = out;
    this.w = (this.w + 1) % this.size;
    let y = out;
    if (this.t < this.clickN && this.click > 0) {
      y += (Math.random() * 2 - 1) * this.click * (1 - this.t / this.clickN) * 0.5;
    }
    this.t++;
    if (Math.abs(out) < 1e-5) this.dead++; else this.dead = 0;
    return y;
  }
  get finished() { return this.dead > this.sr * 0.05; }
}

class StringProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.voices = [];
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'pluck') {
        if (this.voices.length > 24) this.voices.shift();
        this.voices.push(new StringVoice(sampleRate, d.freq, d));
      } else if (d.type === 'silence') {
        this.voices.length = 0;
      }
    };
  }
  process(inputs, outputs) {
    const out = outputs[0];
    const ch = out[0];
    const n = ch.length;
    for (let i = 0; i < n; i++) ch[i] = 0;
    for (let v = this.voices.length - 1; v >= 0; v--) {
      const voice = this.voices[v];
      for (let i = 0; i < n; i++) ch[i] += voice.process();
      if (voice.finished) this.voices.splice(v, 1);
    }
    for (let i = 0; i < n; i++) {
      const x = ch[i] * 0.5;
      ch[i] = x > 1 ? 1 : x < -1 ? -1 : x;
    }
    for (let c = 1; c < out.length; c++) out[c].set(ch);
    return true;
  }
}
registerProcessor('string-processor', StringProcessor);
`;

export const AMP_PRESETS = {
  clean:  { name: "Clean",  drive: 0.02, gain: 1.2, bass: 2,  mid: 0,  treble: 3, presence: 2, cab: "1x12" },
  crunch: { name: "Crunch", drive: 0.38, gain: 3.5, bass: 3,  mid: 1,  treble: 3, presence: 3, cab: "4x12v" },
  metal:  { name: "Metal",  drive: 0.78, gain: 9,   bass: 5,  mid: -4, treble: 5, presence: 5, cab: "4x12m" },
  doom:   { name: "Doom",   drive: 0.92, gain: 11,  bass: 7,  mid: -2, treble: 1, presence: 0, cab: "4x12v" },
};
export const CABS = {
  "4x12m":  { name: "4x12 Modern",  hp: 85,  lp: 5200, res: [[110, 5, 1.1], [420, -3, 1.2], [2600, 3, 1.6], [4200, -6, 1.0]] },
  "4x12v":  { name: "4x12 Vintage", hp: 95,  lp: 4200, res: [[105, 4, 1.0], [900, -5, 1.3], [2000, 2, 1.4], [3600, -5, 1.0]] },
  "1x12":   { name: "1x12 Combo",   hp: 110, lp: 6200, res: [[180, 3, 1.1], [1600, -2, 1.2], [3000, 2, 1.5]] },
  "direct": { name: "Direct (no cab)", hp: 0, lp: 0, res: [] },
};

let amp = { ...AMP_PRESETS.metal, master: 1 };
let guitar = { node: null, ready: false, initing: false, chain: null, cabName: null };

export function driveCurve(amount) {
  const n = 2048;
  const c = new Float32Array(n);
  // sharpens quadratically, so low settings stay genuinely clean
  const k = 1 + amount * amount * 150;
  // slight asymmetry for even-order harmonics, eased back as gain rises
  const bias = (0.06 * amount) / (1 + amount * 4);
  const norm = Math.tanh(k * (1 + bias));
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    c[i] = Math.max(-1, Math.min(1, Math.tanh(k * (x + bias)) / norm));
  }
  return c;
}

// Build a speaker impulse response from noise shaped by the cab's filter curve.
// No audio assets to ship, and it still gives the response that makes distortion
// read as "guitar cabinet" rather than "buzz".
export async function buildCabIR(ctx, cabKey) {
  const cab = CABS[cabKey] || CABS["4x12m"];
  if (cabKey === "direct") return null;
  const len = Math.floor(ctx.sampleRate * 0.06);
  const off = new OfflineAudioContext(1, len, ctx.sampleRate);
  const raw = off.createBuffer(1, len, off.sampleRate);
  const d = raw.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / len;
    d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 5) * (i < 3 ? 1 : 0.7);
  }
  const src = off.createBufferSource();
  src.buffer = raw;
  let node = src;
  const hp = off.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = cab.hp; hp.Q.value = 0.8;
  node.connect(hp); node = hp;
  const lp1 = off.createBiquadFilter(); lp1.type = "lowpass"; lp1.frequency.value = cab.lp; lp1.Q.value = 1.1;
  node.connect(lp1); node = lp1;
  const lp2 = off.createBiquadFilter(); lp2.type = "lowpass"; lp2.frequency.value = cab.lp * 1.15; lp2.Q.value = 0.7;
  node.connect(lp2); node = lp2;
  cab.res.forEach(([f, g, q]) => {
    const b = off.createBiquadFilter();
    b.type = "peaking"; b.frequency.value = f; b.gain.value = g; b.Q.value = q;
    node.connect(b); node = b;
  });
  node.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  // normalise so cab changes do not jump in volume
  const ch = rendered.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
  if (peak > 0) for (let i = 0; i < ch.length; i++) ch[i] /= peak;
  return rendered;
}

export async function initGuitar() {
  if (guitar.ready || guitar.initing) return guitar.ready;
  guitar.initing = true;
  try {
    const ctx = ensureCtx();
    const blob = new Blob([KS_WORKLET_SRC], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);

    const node = new AudioWorkletNode(ctx, "string-processor", { outputChannelCount: [1] });
    const tight = ctx.createBiquadFilter(); tight.type = "highpass"; tight.frequency.value = 80; tight.Q.value = 0.7;
    const pre = ctx.createGain();
    const shaper = ctx.createWaveShaper(); shaper.oversample = "4x";
    const post = ctx.createBiquadFilter(); post.type = "lowpass"; post.frequency.value = 9000;
    const bass = ctx.createBiquadFilter(); bass.type = "lowshelf"; bass.frequency.value = 120;
    const mid = ctx.createBiquadFilter(); mid.type = "peaking"; mid.frequency.value = 650; mid.Q.value = 0.9;
    const treble = ctx.createBiquadFilter(); treble.type = "highshelf"; treble.frequency.value = 2600;
    const presence = ctx.createBiquadFilter(); presence.type = "peaking"; presence.frequency.value = 3800; presence.Q.value = 1.1;
    const conv = ctx.createConvolver(); conv.normalize = true;
    const wet = ctx.createGain();
    const master = ctx.createGain(); master.gain.value = 0.9;

    node.connect(tight); tight.connect(pre); pre.connect(shaper); shaper.connect(post);
    post.connect(bass); bass.connect(mid); mid.connect(treble); treble.connect(presence);
    presence.connect(conv); conv.connect(wet); wet.connect(master);
    master.connect(ctx.destination);

    guitar.node = node;
    guitar.chain = { tight, pre, shaper, post, bass, mid, treble, presence, conv, wet, master, presenceOut: presence };
    guitar.ready = true;
    await applyAmp();
    return true;
  } catch (e) {
    guitar.ready = false;
    return false;
  } finally {
    guitar.initing = false;
  }
}

export async function applyAmp() {
  if (!guitar.chain) return;
  const c = guitar.chain;
  c.shaper.curve = driveCurve(amp.drive);
  c.pre.gain.value = amp.gain;
  c.bass.gain.value = amp.bass;
  c.mid.gain.value = amp.mid;
  c.treble.gain.value = amp.treble;
  c.presence.gain.value = amp.presence;
  // hotter gain needs more makeup attenuation so levels stay even
  c.master.gain.value = (0.95 / (1 + amp.gain * 0.16)) * (amp.master === undefined ? 1 : amp.master);
  if (guitar.cabName !== amp.cab) {
    const ir = await buildCabIR(ensureCtx(), amp.cab);
    if (ir) {
      c.conv.buffer = ir;
      c.presence.disconnect();
      c.presence.connect(c.conv);
      c.conv.connect(c.wet);
    } else {
      // direct: route around the cab
      c.presence.disconnect();
      c.presence.connect(c.wet);
    }
    guitar.cabName = amp.cab;
  }
}

export function setAmp(patch) {
  amp = { ...amp, ...patch };
  applyAmp();
  return amp;
}
export function getAmp() { return amp; }
export function ampPreset(key) {
  if (!AMP_PRESETS[key]) return amp;
  return setAmp({ ...AMP_PRESETS[key] });
}
export function pluck(midi, when = 0, opts = {}) {
  if (!guitar.ready || !guitar.node) return false;
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const msg = {
    type: "pluck", freq,
    vel: opts.gain === undefined ? 1 : Math.max(0.15, Math.min(1.6, opts.gain)),
    mute: opts.mute === undefined ? TONE.mute : opts.mute,
    pickPos: opts.pickPos,
    sustain: opts.sustain,
  };
  if (when > 0) setTimeout(() => { try { guitar.node.port.postMessage(msg); } catch (e) {} }, when * 1000);
  else guitar.node.port.postMessage(msg);
  return true;
}


// ---------- Sampler: real recorded instruments ----------
// FluidR3_GM soundfont samples (CC-BY 3.0, Frank Wen), one mp3 every two
// semitones; the sampler pitch-shifts at most one semitone from a real note.
const SAMPLE_BASE = "/samples";
export const INSTRUMENTS = {
  distortion_guitar:     { name: "Distortion",   kind: "guitar" },
  overdriven_guitar:     { name: "Overdrive",    kind: "guitar" },
  electric_guitar_clean: { name: "Clean",        kind: "guitar" },
  electric_guitar_muted: { name: "Muted",        kind: "guitar" },
  acoustic_guitar_steel: { name: "Acoustic",     kind: "guitar" },
  electric_bass_pick:    { name: "Bass",         kind: "bass" },
};
export const sampler = {
  manifest: null,
  buffers: {},     // inst -> { midi: AudioBuffer }
  loading: {},
  out: null,
  eq: null,
  ready: false,
  current: "distortion_guitar",
  muteInst: "electric_guitar_muted",
  level: 0.85,
};

function samplerChain() {
  const ctx = ensureCtx();
  if (sampler.out) return sampler.out;
  const bass = ctx.createBiquadFilter(); bass.type = "lowshelf"; bass.frequency.value = 140; bass.gain.value = 0;
  const mid = ctx.createBiquadFilter(); mid.type = "peaking"; mid.frequency.value = 700; mid.Q.value = 0.9; mid.gain.value = 0;
  const treble = ctx.createBiquadFilter(); treble.type = "highshelf"; treble.frequency.value = 3000; treble.gain.value = 0;
  const out = ctx.createGain(); out.gain.value = sampler.level;
  bass.connect(mid); mid.connect(treble); treble.connect(out); out.connect(ctx.destination);
  sampler.eq = { bass, mid, treble };
  sampler.out = out;
  sampler.input = bass;
  return out;
}

async function loadManifest() {
  if (sampler.manifest) return sampler.manifest;
  const res = await fetch(`${SAMPLE_BASE}/manifest.json`);
  sampler.manifest = await res.json();
  return sampler.manifest;
}

export async function loadInstrument(inst) {
  if (sampler.buffers[inst]) return true;
  if (sampler.loading[inst]) return sampler.loading[inst];
  sampler.loading[inst] = (async () => {
    try {
      const ctx = ensureCtx();
      samplerChain();
      const man = await loadManifest();
      const notes = man[inst];
      if (!notes) return false;
      const store = {};
      await Promise.all(notes.map(async (m) => {
        const r = await fetch(`${SAMPLE_BASE}/${inst}/${m}.mp3`);
        const ab = await r.arrayBuffer();
        store[m] = await ctx.decodeAudioData(ab);
      }));
      sampler.buffers[inst] = store;
      sampler.ready = true;
      return true;
    } catch (e) {
      return false;
    } finally {
      delete sampler.loading[inst];
    }
  })();
  return sampler.loading[inst];
}

function nearestSample(inst, midi) {
  const store = sampler.buffers[inst];
  if (!store) return null;
  const keys = Object.keys(store).map(Number);
  let best = keys[0];
  for (const k of keys) if (Math.abs(k - midi) < Math.abs(best - midi)) best = k;
  return best;
}

export function setInstrument(inst) {
  if (!INSTRUMENTS[inst]) return;
  sampler.current = inst;
  loadInstrument(inst);
}
export function setSamplerEq(patch) {
  samplerChain();
  if (!sampler.eq) return;
  if (patch.bass !== undefined) sampler.eq.bass.gain.value = patch.bass;
  if (patch.mid !== undefined) sampler.eq.mid.gain.value = patch.mid;
  if (patch.treble !== undefined) sampler.eq.treble.gain.value = patch.treble;
  if (patch.level !== undefined) { sampler.level = patch.level; sampler.out.gain.value = patch.level; }
}

// Play a real recorded note. Returns false if samples are not loaded yet.
export function playSample(midi, when = 0, dur = 0.9, opts = {}) {
  const mute = opts.mute === undefined ? TONE.mute : opts.mute;
  const inst = mute ? sampler.muteInst : sampler.current;
  const store = sampler.buffers[inst];
  if (!store) { loadInstrument(inst); return false; }
  const src0 = nearestSample(inst, midi);
  if (src0 === null || src0 === undefined) return false;
  try {
    const ctx = ensureCtx();
    samplerChain();
    const t0 = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = store[src0];
    src.playbackRate.value = Math.pow(2, (midi - src0) / 12);
    const g = ctx.createGain();
    const vel = Math.max(0.15, Math.min(1.5, opts.gain === undefined ? 1 : opts.gain));
    const len = mute ? Math.min(dur, 0.22) : dur;
    g.gain.setValueAtTime(vel, t0);
    // let it ring, then release rather than cutting abruptly
    g.gain.setValueAtTime(vel, t0 + len * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + len + (mute ? 0.05 : 0.25));
    src.connect(g);
    g.connect(sampler.input);
    src.start(t0);
    src.stop(t0 + len + (mute ? 0.1 : 0.35));
    return true;
  } catch (e) {
    return false;
  }
}

// ---------- Drums ----------
export function noiseBuffer(ctx) {
  const len = Math.floor(ctx.sampleRate * 0.3);
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
let noiseBuf = null;
export function playDrum(kind, when = 0, accent = false) {
  try {
    const ctx = ensureCtx();
    const t0 = ctx.currentTime + when;
    if (!noiseBuf) noiseBuf = noiseBuffer(ctx);
    if (kind === "k") {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(150, t0);
      o.frequency.exponentialRampToValueAtTime(42, t0 + 0.09);
      g.gain.setValueAtTime(accent ? 0.9 : 0.7, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24);
      o.connect(g); g.connect(ctx.destination);
      o.start(t0); o.stop(t0 + 0.3);
    } else if (kind === "s") {
      const n = ctx.createBufferSource(); n.buffer = noiseBuf;
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1400;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(accent ? 0.5 : 0.38, t0);
      ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.17);
      const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = 190;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.22, t0);
      og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
      n.connect(hp); hp.connect(ng); ng.connect(ctx.destination);
      o.connect(og); og.connect(ctx.destination);
      n.start(t0); n.stop(t0 + 0.2); o.start(t0); o.stop(t0 + 0.12);
    } else {
      const n = ctx.createBufferSource(); n.buffer = noiseBuf;
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(accent ? 0.22 : 0.13, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
      n.connect(hp); hp.connect(g); g.connect(ctx.destination);
      n.start(t0); n.stop(t0 + 0.07);
    }
  } catch (e) { /* noop */ }
}

// ---------- MIDI file export ----------
export function midiFile(events, ppq = 480) {
  // events: [{ midi, startTicks, durTicks, channel, velocity }]
  const bytes = [];
  const push = (...b) => bytes.push(...b);
  const varLen = (v) => {
    const out = [v & 0x7f];
    v >>= 7;
    while (v > 0) { out.unshift((v & 0x7f) | 0x80); v >>= 7; }
    return out;
  };
  const track = [];
  const flat = [];
  events.forEach((e) => {
    flat.push({ t: e.startTicks, type: 0x90, midi: e.midi, ch: e.channel || 0, v: e.velocity || 100 });
    flat.push({ t: e.startTicks + e.durTicks, type: 0x80, midi: e.midi, ch: e.channel || 0, v: 0 });
  });
  flat.sort((a, b) => a.t - b.t || a.type - b.type);
  let last = 0;
  flat.forEach((e) => {
    track.push(...varLen(e.t - last));
    track.push(e.type | e.ch, e.midi & 0x7f, e.v & 0x7f);
    last = e.t;
  });
  track.push(0x00, 0xff, 0x2f, 0x00); // end of track
  const be32 = (n) => [(n >> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
  push(0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (ppq >> 8) & 255, ppq & 255);
  push(0x4d, 0x54, 0x72, 0x6b, ...be32(track.length), ...track);
  return new Uint8Array(bytes);
}
export function downloadBytes(bytes, filename) {
  try {
    const blob = new Blob([bytes], { type: "audio/midi" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch (e) { return false; }
}

// ---------- Microphone pitch detection ----------
let micState = { stream: null, analyser: null, raf: null, buf: null, src: null };
// Autocorrelation with normalized square difference — robust for guitar
export function autoCorrelate(buf, sampleRate) {
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.008) return -1; // too quiet

  let r1 = 0, r2 = SIZE - 1;
  const thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
  for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
  const b = buf.slice(r1, r2);
  const N = b.length;
  if (N < 512) return -1;

  const c = new Float32Array(N).fill(0);
  for (let lag = 0; lag < N; lag++) {
    let sum = 0;
    for (let i = 0; i < N - lag; i++) sum += b[i] * b[i + lag];
    c[lag] = sum;
  }
  let d = 0;
  while (d < N - 1 && c[d] > c[d + 1]) d++;
  let maxval = -1, maxpos = -1;
  for (let i = d; i < N; i++) if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
  if (maxpos <= 0) return -1;
  let T0 = maxpos;
  // parabolic interpolation for sub-sample accuracy
  const x1 = c[T0 - 1] || 0, x2 = c[T0], x3 = c[T0 + 1] || 0;
  const a = (x1 + x3 - 2 * x2) / 2;
  const bb = (x3 - x1) / 2;
  if (a) T0 -= bb / (2 * a);
  const freq = sampleRate / T0;
  if (freq < 55 || freq > 1400) return -1; // outside guitar/bass range
  return freq;
}
export async function startMic(onPitch) {
  const ctx = ensureCtx();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  src.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  micState = { stream, analyser, src, buf, raf: null };
  const loop = () => {
    analyser.getFloatTimeDomainData(buf);
    const f = autoCorrelate(buf, ctx.sampleRate);
    onPitch(f);
    micState.raf = requestAnimationFrame(loop);
  };
  loop();
}
export function stopMic() {
  if (micState.raf) cancelAnimationFrame(micState.raf);
  if (micState.stream) micState.stream.getTracks().forEach((t) => t.stop());
  try { if (micState.src) micState.src.disconnect(); } catch (e) { /* noop */ }
  micState = { stream: null, analyser: null, raf: null, buf: null, src: null };
}
export function freqToMidi(f) { return Math.round(69 + 12 * Math.log2(f / 440)); }
export function centsOff(f) {
  const m = 69 + 12 * Math.log2(f / 440);
  return Math.round((m - Math.round(m)) * 100);
}

// Sustained root drone
export function startDrone(rootPc) {
  stopDrone();
  const ctx = ensureCtx();
  const midi = 36 + ((rootPc - 3 + 12) % 12);
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const a = ctx.createOscillator(); a.type = "sawtooth"; a.frequency.value = freq;
  const b = ctx.createOscillator(); b.type = "sawtooth"; b.frequency.value = freq; b.detune.value = 8;
  const sub = ctx.createOscillator(); sub.type = "sine"; sub.frequency.value = freq / 2;
  const filt = ctx.createBiquadFilter(); filt.type = "lowpass"; filt.frequency.value = 700; filt.Q.value = 2;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.11, ctx.currentTime + 0.4);
  a.connect(filt); b.connect(filt); sub.connect(filt);
  filt.connect(gain); gain.connect(ctx.destination);
  a.start(); b.start(); sub.start();
  droneNodes = { a, b, sub, gain, ctx };
}
export function stopDrone() {
  if (!droneNodes) return;
  const { a, b, sub, gain, ctx } = droneNodes;
  try {
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    a.stop(ctx.currentTime + 0.3); b.stop(ctx.currentTime + 0.3); sub.stop(ctx.currentTime + 0.3);
  } catch (e) { /* noop */ }
  droneNodes = null;
}
