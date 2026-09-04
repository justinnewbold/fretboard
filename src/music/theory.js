// Music theory, tunings, scales, chords, meters and fingering paths.

// ---------- Music theory core ----------
// Pitch classes use A = 0 ... G# = 11
export const SHARP_NAMES = ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"];
export const FLAT_NAMES  = ["A", "Bb", "B", "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab"];
export const midiToPc = (midi) => (midi + 3) % 12;
export const pcName = (pc, flats) => (flats ? FLAT_NAMES : SHARP_NAMES)[pc];

export const INTERVAL_LABELS = { 0: "R", 1: "b2", 2: "2", 3: "b3", 4: "3", 5: "4", 6: "b5", 7: "5", 8: "b6", 9: "6", 10: "b7", 11: "7" };
export const INTERVAL_FULL = { 0: "Unison", 1: "Minor 2nd", 2: "Major 2nd", 3: "Minor 3rd", 4: "Major 3rd", 5: "Perfect 4th", 6: "Tritone", 7: "Perfect 5th", 8: "Minor 6th", 9: "Major 6th", 10: "Minor 7th", 11: "Major 7th" };
export const ROMAN = ["I", "bII", "II", "bIII", "III", "IV", "bV", "V", "bVI", "VI", "bVII", "VII"];

export const MAJOR = [0, 2, 4, 5, 7, 9, 11];
export const MINOR = [0, 2, 3, 5, 7, 8, 10];

export const SCALES = [
  { name: "Minor Pentatonic", group: "Core", intervals: [0, 3, 5, 7, 10], parent: MINOR },
  { name: "Major Pentatonic", group: "Core", intervals: [0, 2, 4, 7, 9], parent: MAJOR },
  { name: "Blues", group: "Core", intervals: [0, 3, 5, 6, 7, 10], parent: MINOR },
  { name: "Natural Minor (Aeolian)", group: "Core", intervals: MINOR },
  { name: "Major (Ionian)", group: "Core", intervals: MAJOR },
  { name: "Dorian", group: "Modes", intervals: [0, 2, 3, 5, 7, 9, 10] },
  { name: "Phrygian", group: "Modes", intervals: [0, 1, 3, 5, 7, 8, 10] },
  { name: "Lydian", group: "Modes", intervals: [0, 2, 4, 6, 7, 9, 11] },
  { name: "Mixolydian", group: "Modes", intervals: [0, 2, 4, 5, 7, 9, 10] },
  { name: "Locrian", group: "Modes", intervals: [0, 1, 3, 5, 6, 8, 10] },
  { name: "Harmonic Minor", group: "Metal & exotic", intervals: [0, 2, 3, 5, 7, 8, 11] },
  { name: "Phrygian Dominant", group: "Metal & exotic", intervals: [0, 1, 4, 5, 7, 8, 10] },
  { name: "Hungarian / Gypsy Minor", group: "Metal & exotic", intervals: [0, 2, 3, 6, 7, 8, 11] },
  { name: "Double Harmonic", group: "Metal & exotic", intervals: [0, 1, 4, 5, 7, 8, 11] },
  { name: "Neapolitan Minor", group: "Metal & exotic", intervals: [0, 1, 3, 5, 7, 8, 11] },
  { name: "Altered / Super Locrian", group: "Metal & exotic", intervals: [0, 1, 3, 4, 6, 8, 10] },
  { name: "Diminished (half-whole)", group: "Metal & exotic", intervals: [0, 1, 3, 4, 6, 7, 9, 10] },
  { name: "Diminished (whole-half)", group: "Metal & exotic", intervals: [0, 2, 3, 5, 6, 8, 9, 11] },
  { name: "Whole Tone", group: "Metal & exotic", intervals: [0, 2, 4, 6, 8, 10] },
];
export const SCALE_GROUPS = ["Core", "Modes", "Metal & exotic"];

// How each interval reads against a held pedal/root note
export const PEDAL_CHARACTER = {
  0: "unison \u2014 pure chug",
  1: "b2 \u2014 Phrygian menace",
  2: "2 \u2014 tense lift",
  3: "b3 \u2014 minor weight",
  4: "3 \u2014 major brightness",
  5: "4 \u2014 suspended push",
  6: "b5 \u2014 THE TRITONE",
  7: "5 \u2014 pure power",
  8: "b6 \u2014 dread / doom",
  9: "6 \u2014 open, hopeful",
  10: "b7 \u2014 classic rock pull",
  11: "7 \u2014 neoclassical bite",
};

// Tunings: MIDI note numbers, LOW string first
export const TUNINGS = [
  // 6-string
  { name: "E Standard", group: "6-string", midi: [40, 45, 50, 55, 59, 64] },
  { name: "Half-step Down (Eb)", group: "6-string", midi: [39, 44, 49, 54, 58, 63] },
  { name: "Drop D", group: "6-string", midi: [38, 45, 50, 55, 59, 64] },
  { name: "D Standard", group: "6-string", midi: [38, 43, 48, 53, 57, 62] },
  { name: "Drop C", group: "6-string", midi: [36, 43, 48, 53, 57, 62] },
  { name: "Drop B", group: "6-string", midi: [35, 42, 47, 52, 56, 61] },
  { name: "Drop A", group: "6-string", midi: [33, 40, 45, 50, 54, 59] },
  { name: "Open D", group: "6-string", midi: [38, 45, 50, 54, 57, 62] },
  { name: "Open G", group: "6-string", midi: [38, 43, 50, 55, 59, 62] },
  { name: "DADGAD", group: "6-string", midi: [38, 45, 50, 55, 57, 62] },
  // 7-string
  { name: "B Standard", group: "7-string", midi: [35, 40, 45, 50, 55, 59, 64] },
  { name: "Drop A", group: "7-string", midi: [33, 40, 45, 50, 55, 59, 64] },
  { name: "A Standard", group: "7-string", midi: [33, 38, 43, 48, 53, 57, 62] },
  { name: "Drop G#", group: "7-string", midi: [32, 39, 44, 49, 54, 58, 63] },
  // 8-string
  { name: "F# Standard", group: "8-string", midi: [30, 35, 40, 45, 50, 55, 59, 64] },
  { name: "Drop E", group: "8-string", midi: [28, 35, 40, 45, 50, 55, 59, 64] },
  { name: "E Standard", group: "8-string", midi: [28, 33, 38, 43, 48, 53, 57, 62] },
  // bass
  { name: "4-string E Standard", group: "Bass", midi: [28, 33, 38, 43] },
  { name: "5-string B Standard", group: "Bass", midi: [23, 28, 33, 38, 43] },
];
export const TUNING_GROUPS = ["6-string", "7-string", "8-string", "Bass"];

export const INLAY_FRETS = [3, 5, 7, 9, 15, 17, 19, 21];
export const DOUBLE_INLAY = [12, 24];

// CAGED position windows, in frets relative to the root fret on the lowest string
export const CAGED_SHAPES = { C: { start: 4, end: 8 }, A: { start: 7, end: 10 }, G: { start: 9, end: 12 }, E: { start: 0, end: 3 }, D: { start: 2, end: 5 } };
export const CAGED_ORDER = ["C", "A", "G", "E", "D"];
export const SHAPE_TO_POSITION = { E: 1, D: 2, C: 3, A: 4, G: 5 };

// ---------- Diatonic chords ----------
export function quality(t, f) {
  if (t === 4 && f === 7) return { suffix: "", minor: false, label: "maj" };
  if (t === 3 && f === 7) return { suffix: "m", minor: true, label: "min" };
  if (t === 3 && f === 6) return { suffix: "\u00B0", minor: true, label: "dim" };
  if (t === 4 && f === 8) return { suffix: "+", minor: false, label: "aug" };
  if (t === 2 && f === 7) return { suffix: "sus2", minor: false, label: "sus2" };
  if (t === 5 && f === 7) return { suffix: "sus4", minor: false, label: "sus4" };
  return { suffix: "?", minor: false, label: "alt" };
}
export function diatonicChords(rootPc, intervals) {
  const n = intervals.length;
  if (n < 7) return [];
  return intervals.map((iv, i) => {
    const thirdIv = intervals[(i + 2) % n];
    const fifthIv = intervals[(i + 4) % n];
    const t = (thirdIv - iv + 12) % 12;
    const f = (fifthIv - iv + 12) % 12;
    const q = quality(t, f);
    const rpc = (rootPc + iv) % 12;
    const pcs = [rpc, (rootPc + thirdIv) % 12, (rootPc + fifthIv) % 12];
    let roman = ROMAN[iv];
    if (q.minor) roman = roman.toLowerCase();
    if (q.label === "dim") roman += "\u00B0";
    if (q.label === "aug") roman += "+";
    return { rootPc: rpc, pcs, suffix: q.suffix, roman, degree: i + 1 };
  });
}

// ---------- Progressions (scale degrees, 1-indexed) ----------
export function majorizeChord(ch) {
  return {
    ...ch,
    pcs: [ch.rootPc, (ch.rootPc + 4) % 12, (ch.rootPc + 7) % 12],
    suffix: "",
    roman: ch.roman.replace(/\u00B0|\+/g, "").toUpperCase(),
  };
}

export const PROGRESSIONS = [
  { name: "I \u2013 V \u2013 vi \u2013 IV", degrees: [1, 5, 6, 4], note: "Pop / four chords" },
  { name: "I \u2013 IV \u2013 V", degrees: [1, 4, 5], note: "Rock & roll" },
  { name: "ii \u2013 V \u2013 I", degrees: [2, 5, 1], note: "Jazz turnaround" },
  { name: "vi \u2013 IV \u2013 I \u2013 V", degrees: [6, 4, 1, 5], note: "Sensitive / ballad" },
  { name: "I \u2013 vi \u2013 IV \u2013 V", degrees: [1, 6, 4, 5], note: "50s doo-wop" },
  { name: "12-bar blues", degrees: [1, 1, 1, 1, 4, 4, 1, 1, 5, 4, 1, 5], note: "One chord per bar" },
  { name: "i \u2013 bVII \u2013 bVI \u2013 bVII", degrees: [1, 7, 6, 7], note: "Minor vamp" },
  { name: "i \u2013 bVII \u2013 bVI \u2013 V", degrees: [1, 7, 6, 5], note: "Andalusian (major V)", majorize: [5] },
  { name: "i \u2013 iv \u2013 v", degrees: [1, 4, 5], note: "Minor blues feel" },
  { name: "I \u2013 V \u2013 vi \u2013 iii \u2013 IV", degrees: [1, 5, 6, 3, 4], note: "Canon-style descent" },
];

// ---------- Rhythm / meter ----------
// "3+2+2" -> [3,2,2]; accents land on the first beat of each group
export function parseGroups(str) {
  const g = String(str).split("+").map((x) => parseInt(x.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0 && n <= 16);
  return g.length ? g.slice(0, 12) : [4];
}
export function groupStarts(groups) {
  const starts = new Set();
  let acc = 0;
  for (const g of groups) { starts.add(acc); acc += g; }
  return starts;
}
export const METER_PRESETS = [
  { label: "4/4", value: "4" },
  { label: "3/4", value: "3" },
  { label: "5/8 (3+2)", value: "3+2" },
  { label: "7/8 (2+2+3)", value: "2+2+3" },
  { label: "7/8 (3+2+2)", value: "3+2+2" },
  { label: "9/8 (2+2+2+3)", value: "2+2+2+3" },
  { label: "11/8 (3+3+3+2)", value: "3+3+3+2" },
  { label: "Djent 16 (3+3+2+3+3+2)", value: "3+3+2+3+3+2" },
];

// ---------- Fingering path ----------
// Box-style: start at the root on the lowest string and climb within a ~4-fret
// reach, moving to the next string when a note passes that reach.
export function buildPath(tuningMidi, rootPc, intervals, octaves, maxFret) {
  const lowOpen = tuningMidi[0];
  const rootFret = ((rootPc - midiToPc(lowOpen)) + 12) % 12;
  const targets = [];
  for (let o = 0; o < octaves; o++) intervals.forEach((iv) => targets.push(lowOpen + rootFret + iv + o * 12));
  targets.push(lowOpen + rootFret + octaves * 12);
  const path = [];
  let s = 0;
  let anchor = rootFret;
  const REACH = 4;
  for (const m of targets) {
    let fret = m - tuningMidi[s];
    while (s < tuningMidi.length - 1 && fret > anchor + REACH && m - tuningMidi[s + 1] >= 0) {
      s++;
      fret = m - tuningMidi[s];
    }
    if (fret > anchor + REACH) anchor = fret - REACH;
    if (fret > maxFret) break;
    path.push({ string: s, fret, midi: m });
  }
  return path;
}
export function applyDirection(path, dir) {
  if (dir === "down") return [...path].reverse();
  if (dir === "updown") return [...path, ...[...path].reverse().slice(1)];
  return path;
}
