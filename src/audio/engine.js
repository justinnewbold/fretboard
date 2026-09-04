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
