import { useState, useEffect, useRef } from "react";
import {
  SHARP_NAMES, midiToPc, pcName, INTERVAL_LABELS, INTERVAL_FULL, ROMAN,
  SCALES, SCALE_GROUPS, PEDAL_CHARACTER, TUNINGS, TUNING_GROUPS,
  INLAY_FRETS, DOUBLE_INLAY, CAGED_SHAPES, CAGED_ORDER, SHAPE_TO_POSITION,
  diatonicChords, majorizeChord, PROGRESSIONS,
  parseGroups, groupStarts, METER_PRESETS, buildPath, applyDirection,
} from "./music/theory.js";
import {
  ensureCtx, playMidi, playChord, playPower, playClick, playDrum,
  midiFile, downloadBytes, startMic, stopMic, freqToMidi, centsOff,
  startDrone, stopDrone, TONE,
  initGuitar, setAmp, AMP_PRESETS, CABS,
} from "./audio/engine.js";
import { loadJSON, saveJSON } from "./storage.js";

export default function FretboardScaleExplorer() {
  // scale / display
  const [rootPc, setRootPc] = useState(7);
  const [scaleIdx, setScaleIdx] = useState(0);
  const [tuningIdx, setTuningIdx] = useState(0);
  const [labelMode, setLabelMode] = useState("notes");
  const [useFlats, setUseFlats] = useState(false);
  const [fretCount, setFretCount] = useState(15);
  const [lefty, setLefty] = useState(false);
  const [lowOnTop, setLowOnTop] = useState(false);
  const [caged, setCaged] = useState(null);
  const [chordIdx, setChordIdx] = useState(null);
  const [progIdx, setProgIdx] = useState(null);
  const [progPlaying, setProgPlaying] = useState(false);
  const [progStep, setProgStep] = useState(-1);
  const [progChord, setProgChord] = useState(null);
  const [beatsPerChord, setBeatsPerChord] = useState(4);
  const beatsRef = useRef(4);
  const progRef = useRef({ timer: null });
  const [mode, setMode] = useState("scale"); // scale | riff | intervals | quiz
  const [drive, setDrive] = useState(true);
  const [ampKey, setAmpKey] = useState("metal");
  const [ampCfg, setAmpCfg] = useState(() => ({ ...AMP_PRESETS.metal }));
  const [palmMute, setPalmMute] = useState(false);
  const [droneOn, setDroneOn] = useState(false);
  const [chordStyle, setChordStyle] = useState("power"); // triad | power
  const [pedalFret, setPedalFret] = useState(0);
  const [speedTrain, setSpeedTrain] = useState(false);
  const [meter, setMeter] = useState("4");
  const [gapMode, setGapMode] = useState("off"); // off | "1:1" | "2:2" | "3:1"
  const gapRef = useRef("off");
  const [gridLen, setGridLen] = useState(16);
  const emptyPat = (n) => ({ g: Array.from({ length: n }, () => null), d: { k: Array(n).fill(false), s: Array(n).fill(false), h: Array(n).fill(false) } });
  const [patterns, setPatterns] = useState(() => ({ A: emptyPat(16), B: emptyPat(16), C: emptyPat(16), D: emptyPat(16) }));
  const [curPat, setCurPat] = useState("A");
  const [arrangement, setArrangement] = useState("A A B A");
  const [songPlaying, setSongPlaying] = useState(false);
  const [songPos, setSongPos] = useState(-1);
  const songRef = useRef({ timer: null });
  const [drumsOn, setDrumsOn] = useState(true);
  const drumsOnRef = useRef(true);
  const curPatRef = useRef("A");
  const [brush, setBrush] = useState("P");
  const [gridStep, setGridStep] = useState(-1);
  const [gridPlaying, setGridPlaying] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [micErr, setMicErr] = useState(null);
  const [micPitch, setMicPitch] = useState(null); // { pc, cents, midi }
  const micHandlerRef = useRef(() => {});
  const micStableRef = useRef({ pc: null, count: 0, lastFire: 0 });
  const [scoreOn, setScoreOn] = useState(false);
  const [score, setScore] = useState({ hits: 0, total: 0, streak: 0 });
  const expectRef = useRef({ pc: null, hit: false });
  const scoreOnRef = useRef(false);
  useEffect(() => { scoreOnRef.current = scoreOn; }, [scoreOn]);

  // record the note the player is meant to be hitting right now
  const expectNote = (pc) => {
    const e = expectRef.current;
    if (scoreOnRef.current && e.pc !== null) {
      setScore((s0) => ({
        hits: s0.hits + (e.hit ? 1 : 0),
        total: s0.total + 1,
        streak: e.hit ? s0.streak + 1 : 0,
      }));
    }
    expectRef.current = { pc, hit: false };
  };
  const gridRef = useRef({ timer: null });
  const gridStepsRef = useRef([]);
  const patternsRef = useRef(null);
  const meterRef = useRef("4");
  const loopCountRef = useRef(0);
  const speedTrainRef = useRef(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [panelTab, setPanelTab] = useState("scale"); // scale | chords | prog

  // playback
  const [playing, setPlaying] = useState(false);
  const [activePos, setActivePos] = useState(null);
  const [activeIv, setActiveIv] = useState(null); // scale interval currently sounding
  const [harmonyPos, setHarmonyPos] = useState(null);
  const [loop, setLoop] = useState(false);
  const [octaves, setOctaves] = useState(1);
  const [direction, setDirection] = useState("up");
  const [subdiv, setSubdiv] = useState(1);
  const loopRef = useRef(false);
  const subdivRef = useRef(1);
  const seqRef = useRef({ timer: null });

  // metronome
  const [metroOn, setMetroOn] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [beatFlash, setBeatFlash] = useState(-1);
  const [gapSilent, setGapSilent] = useState(false);
  const [tapMsg, setTapMsg] = useState("");
  const bpmRef = useRef(120);
  const metroRef = useRef({ timer: null, nextTime: 0, beat: 0 });
  const tapsRef = useRef([]);

  // interval explorer + quiz
  const [refPos, setRefPos] = useState(null);
  const [quizTarget, setQuizTarget] = useState(null);
  const [quizScope, setQuizScope] = useState("all"); // all | scale
  const [quizScore, setQuizScore] = useState(0);
  const [quizTries, setQuizTries] = useState(0);
  const [quizStreak, setQuizStreak] = useState(0);
  const [quizBest, setQuizBest] = useState(0);
  const [quizFlash, setQuizFlash] = useState(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [heat, setHeat] = useState(() => Array.from({ length: 12 }, () => ({ right: 0, wrong: 0 })));
  const [drillWeak, setDrillWeak] = useState(false);

  const boardRef = useRef(null);

  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { loopRef.current = loop; }, [loop]);
  useEffect(() => { subdivRef.current = subdiv; }, [subdiv]);
  useEffect(() => { beatsRef.current = beatsPerChord; }, [beatsPerChord]);
  useEffect(() => { speedTrainRef.current = speedTrain; }, [speedTrain]);
  useEffect(() => { meterRef.current = meter; }, [meter]);
  useEffect(() => { gapRef.current = gapMode; }, [gapMode]);
  const gridSteps = patterns[curPat].g;
  const drumSteps = patterns[curPat].d;
  const setGridSteps = (updater) => setPatterns((prev) => {
    const cur = prev[curPat];
    const next = typeof updater === "function" ? updater(cur.g) : updater;
    return { ...prev, [curPat]: { ...cur, g: next } };
  });
  const toggleDrum = (lane, i) => setPatterns((prev) => {
    const cur = prev[curPat];
    const lanes = { ...cur.d, [lane]: cur.d[lane].map((v, idx) => (idx === i ? !v : v)) };
    return { ...prev, [curPat]: { ...cur, d: lanes } };
  });
  useEffect(() => { gridStepsRef.current = gridSteps; }, [gridSteps]);
  useEffect(() => { patternsRef.current = patterns; }, [patterns]);
  useEffect(() => { drumsOnRef.current = drumsOn; }, [drumsOn]);
  useEffect(() => { curPatRef.current = curPat; }, [curPat]);
  useEffect(() => {
    setPatterns((prev) => {
      const out = {};
      for (const k of Object.keys(prev)) {
        const p0 = prev[k];
        out[k] = {
          g: Array.from({ length: gridLen }, (_, i) => (i < p0.g.length ? p0.g[i] : null)),
          d: {
            k: Array.from({ length: gridLen }, (_, i) => (i < p0.d.k.length ? p0.d.k[i] : false)),
            s: Array.from({ length: gridLen }, (_, i) => (i < p0.d.s.length ? p0.d.s[i] : false)),
            h: Array.from({ length: gridLen }, (_, i) => (i < p0.d.h.length ? p0.d.h[i] : false)),
          },
        };
      }
      return out;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridLen]);
  useEffect(() => () => { if (gridRef.current.timer) clearTimeout(gridRef.current.timer); }, []);
  useEffect(() => { TONE.drive = drive; }, [drive]);
  useEffect(() => { initGuitar(); }, []);
  useEffect(() => { setAmp(ampCfg); }, [ampCfg]);
  useEffect(() => {
    // the Dist button swaps between the clean voicing and the last dirty amp
    if (!drive) setAmpCfg((c) => ({ ...c, drive: AMP_PRESETS.clean.drive, gain: AMP_PRESETS.clean.gain }));
    else setAmpCfg((c) => ({ ...c, drive: AMP_PRESETS[ampKey].drive, gain: AMP_PRESETS[ampKey].gain }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drive]);
  useEffect(() => { TONE.mute = palmMute; }, [palmMute]);
  useEffect(() => {
    if (droneOn) startDrone(rootPc); else stopDrone();
  }, [droneOn, rootPc]);
  useEffect(() => () => stopDrone(), []);
  useEffect(() => () => {
    if (metroRef.current.timer) clearInterval(metroRef.current.timer);
    if (seqRef.current.timer) clearTimeout(seqRef.current.timer);
    if (progRef.current.timer) clearTimeout(progRef.current.timer);
  }, []);

  // ----- derived -----
  const scale = SCALES[scaleIdx];
  const tuning = TUNINGS[tuningIdx];
  const scaleSet = new Set(scale.intervals.map((i) => (rootPc + i) % 12));
  const chordSource = scale.intervals.length >= 7 ? scale.intervals : scale.parent || MAJOR;
  const chords = diatonicChords(rootPc, chordSource);
  const chordList = chordStyle === "power"
    ? chordSource.map((iv) => { const rpc = (rootPc + iv) % 12; return { rootPc: rpc, pcs: [rpc, (rpc + 7) % 12], suffix: "5", roman: ROMAN[iv] }; })
    : chords;
  const activeChord = progChord || (chordIdx !== null && chordList[chordIdx] ? chordList[chordIdx] : null);
  const chordSet = activeChord ? new Set(activeChord.pcs) : null;
  const progChordAt = (pi, i) => {
    const p = PROGRESSIONS[pi];
    const deg = p.degrees[i];
    let ch = chords[deg - 1];
    if (!ch) return null;
    if (p.majorize && p.majorize.includes(deg)) ch = majorizeChord(ch);
    return ch;
  };

  // ----- power chords -----
  const isDropTuning = tuning.midi.length > 1 && (tuning.midi[1] - tuning.midi[0]) === 7;
  // lowest playable grip for a power chord root
  const powerGrip = (rpc) => {
    for (let s = 0; s < Math.max(1, tuning.midi.length - 2); s++) {
      const f = ((rpc - midiToPc(tuning.midi[s])) + 12) % 12;
      if (f <= fretCount) return { string: s, fret: f };
    }
    return null;
  };

  // ----- pedal tone -----
  const pedalMidi = tuning.midi[0] + pedalFret;
  const pedalPc = midiToPc(pedalMidi);

  const lowPc = midiToPc(tuning.midi[0]);
  const rootFretLow = ((rootPc - lowPc) + 12) % 12;
  let posFrets = null;
  const posRanges = [];
  if (caged) {
    const sh = CAGED_SHAPES[caged];
    posFrets = new Set();
    [-12, 0, 12, 24].forEach((base) => {
      const lo = Math.max(0, rootFretLow + base + sh.start);
      const hi = Math.min(fretCount, rootFretLow + base + sh.end);
      if (lo <= hi) {
        posRanges.push([lo, hi]);
        for (let f = lo; f <= hi; f++) posFrets.add(f);
      }
    });
  }

  // lowOnTop=false renders like standard notation/tab (high string on top)
  const strings = lowOnTop ? [...tuning.midi] : [...tuning.midi].reverse();
  const cellW = fretCount <= 12 ? 60 : fretCount <= 15 ? 54 : fretCount <= 19 ? 46 : 40;

  // ----- metronome -----
  const startMetro = () => {
    const ctx = ensureCtx();
    metroRef.current.nextTime = ctx.currentTime + 0.08;
    metroRef.current.beat = 0;
    metroRef.current.timer = setInterval(() => {
      const m = metroRef.current;
      while (m.nextTime < ctx.currentTime + 0.12) {
        const groups = parseGroups(meterRef.current);
        const total = groups.reduce((a, b) => a + b, 0);
        const starts = groupStarts(groups);
        const b = m.beat % total;
        // gap trainer: silence whole bars so you have to hold time yourself
        let audible = true;
        if (gapRef.current !== "off") {
          const [onBars, offBars] = gapRef.current.split(":").map(Number);
          const bar = Math.floor(m.beat / total) % (onBars + offBars);
          audible = bar < onBars;
        }
        if (audible) playClick(m.nextTime, b === 0, starts.has(b));
        const delay = Math.max(0, (m.nextTime - ctx.currentTime) * 1000);
        const vis = audible;
        setTimeout(() => { setBeatFlash(b); setGapSilent(!vis); }, delay);
        m.nextTime += 60 / bpmRef.current;
        m.beat++;
      }
    }, 25);
    setMetroOn(true);
  };
  const stopMetro = () => {
    if (metroRef.current.timer) clearInterval(metroRef.current.timer);
    metroRef.current.timer = null;
    setMetroOn(false);
    setBeatFlash(-1);
  };
  const tapTempo = () => {
    const now = performance.now();
    const taps = tapsRef.current.filter((t) => now - t < 2500);
    taps.push(now);
    tapsRef.current = taps.slice(-5);
    if (tapsRef.current.length < 2) { setTapMsg("keep tapping\u2026"); return; }
    const gaps = [];
    for (let i = 1; i < tapsRef.current.length; i++) gaps.push(tapsRef.current[i] - tapsRef.current[i - 1]);
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const val = Math.round(60000 / avg);
    if (val >= 40 && val <= 240) {
      setBpm(val);
      setTapMsg(`${tapsRef.current.length} taps`);
    } else setTapMsg("out of range");
  };

  // ----- scale playback -----
  const stopScale = () => {
    if (seqRef.current.timer) clearTimeout(seqRef.current.timer);
    seqRef.current.timer = null;
    setPlaying(false);
    setActivePos(null);
    setActiveIv(null);
    setHarmonyPos(null);
  };
  const playScale = () => {
    if (playing) { stopScale(); return; }
    if (progRef.current.timer) { clearTimeout(progRef.current.timer); progRef.current.timer = null; setProgPlaying(false); setProgStep(-1); }
    const base = buildPath(tuning.midi, rootPc, scale.intervals, octaves, fretCount);
    const path = applyDirection(base, direction);
    if (!path.length) return;
    setPlaying(true);
    loopCountRef.current = 0;
    if (scoreOn) { setScore({ hits: 0, total: 0, streak: 0 }); expectRef.current = { pc: null, hit: false }; }
    let idx = 0;
    const step = () => {
      const pos = path[idx];
      const noteMs = 60000 / bpmRef.current / subdivRef.current;
      playMidi(pos.midi, 0, Math.min(0.75, (noteMs / 1000) * 1.6));
      if (harmonyRef.current) {
        const h = harmonize(pos.midi, harmonyRef.current);
        if (h) playMidi(h, 0.004, Math.min(0.75, (noteMs / 1000) * 1.6), { gain: 0.75 });
        setHarmonyPos(h ? posForMidi(h) : null);
      } else setHarmonyPos(null);
      setActivePos({ s: pos.string, f: pos.fret });
      setActiveIv((midiToPc(pos.midi) - rootPc + 12) % 12);
      expectNote(midiToPc(pos.midi));
      idx++;
      if (idx >= path.length) {
        if (loopRef.current) {
          idx = 0;
          loopCountRef.current += 1;
          if (speedTrainRef.current && loopCountRef.current % 2 === 0) {
            setBpm((b) => Math.min(240, b + 5));
          }
          seqRef.current.timer = setTimeout(step, noteMs);
        } else {
          seqRef.current.timer = setTimeout(() => { setPlaying(false); setActivePos(null); setActiveIv(null); }, noteMs);
        }
        return;
      }
      seqRef.current.timer = setTimeout(step, noteMs);
    };
    step();
  };

  // ----- progression playback -----
  const stopProg = () => {
    if (progRef.current.timer) clearTimeout(progRef.current.timer);
    progRef.current.timer = null;
    setProgPlaying(false);
    setProgStep(-1);
    setProgChord(null);
  };
  const playProg = () => {
    if (progPlaying) { stopProg(); return; }
    if (progIdx === null || !chords.length) return;
    stopScale();
    setChordIdx(null);
    const len = PROGRESSIONS[progIdx].degrees.length;
    setProgPlaying(true);
    let i = 0;
    const step = () => {
      const ch = progChordAt(progIdx, i % len);
      if (ch) {
        const beatMs = 60000 / bpmRef.current;
        playChord(ch.pcs, ch.rootPc, Math.min(2.4, (beatMs * beatsRef.current) / 1000));
        setProgChord(ch);
        setProgStep(i % len);
      }
      i++;
      progRef.current.timer = setTimeout(step, (60000 / bpmRef.current) * beatsRef.current);
    };
    step();
  };

  // ----- riff / pedal tone playback -----
  const playRiff = () => {
    if (playing) { stopScale(); return; }
    stopProg();
    // notes above the pedal, from the scale, on the upper strings
    const notes = buildPath(tuning.midi, rootPc, scale.intervals, octaves, fretCount)
      .filter((n) => n.string > 0);
    if (!notes.length) return;
    setPlaying(true);
    loopCountRef.current = 0;
    let i = 0;
    const step = () => {
      const noteMs = 60000 / bpmRef.current / subdivRef.current;
      const onPedal = i % 2 === 0;
      if (onPedal) {
        playMidi(pedalMidi, 0, noteMs / 1000, { mute: true });
        setActivePos({ s: 0, f: pedalFret });
        setActiveIv(null);
      } else {
        const n = notes[Math.floor(i / 2) % notes.length];
        playMidi(n.midi, 0, Math.min(0.6, (noteMs / 1000) * 1.4));
        setActivePos({ s: n.string, f: n.fret });
        setActiveIv((midiToPc(n.midi) - rootPc + 12) % 12);
      }
      i++;
      if (i >= notes.length * 2) {
        if (loopRef.current) {
          i = 0;
          loopCountRef.current += 1;
          if (speedTrainRef.current && loopCountRef.current % 2 === 0) setBpm((b) => Math.min(240, b + 5));
        } else {
          seqRef.current.timer = setTimeout(() => { setPlaying(false); setActivePos(null); setActiveIv(null); }, noteMs);
          return;
        }
      }
      seqRef.current.timer = setTimeout(step, noteMs);
    };
    step();
  };

  // ----- riff grid: find the neck position for a note above the pedal -----
  const posForMidi = (targetMidi) => {
    for (let st = tuning.midi.length - 1; st >= 0; st--) {
      const f = targetMidi - tuning.midi[st];
      if (f >= 0 && f <= fretCount) return { string: st, fret: f };
    }
    return null;
  };
  const stopGrid = () => {
    if (gridRef.current.timer) clearTimeout(gridRef.current.timer);
    gridRef.current.timer = null;
    setGridPlaying(false);
    setGridStep(-1);
    setActivePos(null);
  };
  const playGrid = () => {
    if (gridPlaying) { stopGrid(); return; }
    stopScale(); stopProg();
    const steps = gridStepsRef.current;
    if (!steps.some((x) => x !== null)) return;
    setGridPlaying(true);
    let i = 0;
    const tick = () => {
      const stepMs = 60000 / bpmRef.current / subdivRef.current;
      const groups = parseGroups(meterRef.current);
      const starts = groupStarts(groups);
      const total = groups.reduce((a, b) => a + b, 0);
      const idxNow = i % gridStepsRef.current.length;
      const v = gridStepsRef.current[idxNow];
      const accented = starts.has(i % total);
      setGridStep(idxNow);
      if (drumsOnRef.current) {
        const d = patternsRef.current[curPatRef.current].d;
        if (d.k[idxNow]) playDrum("k", 0, accented);
        if (d.s[idxNow]) playDrum("s", 0, accented);
        if (d.h[idxNow]) playDrum("h", 0, accented);
      }
      if (v === "P") {
        playMidi(pedalMidi, 0, stepMs / 1000, { mute: true, gain: accented ? 1.35 : 1 });
        setActivePos({ s: 0, f: pedalFret });
      } else if (typeof v === "number") {
        const pos = posForMidi(pedalMidi + v);
        playMidi(pedalMidi + v, 0, Math.min(0.6, (stepMs / 1000) * 1.5), { gain: accented ? 1.3 : 1 });
        setActivePos(pos ? { s: pos.string, f: pos.fret } : null);
      } else {
        setActivePos(null);
      }
      i++;
      if (i >= gridStepsRef.current.length && !loopRef.current) {
        gridRef.current.timer = setTimeout(() => { setGridPlaying(false); setGridStep(-1); setActivePos(null); }, stepMs);
        return;
      }
      if (i >= gridStepsRef.current.length) i = 0;
      gridRef.current.timer = setTimeout(tick, stepMs);
    };
    tick();
  };
  const clearGrid = () => setPatterns((prev) => ({ ...prev, [curPat]: emptyPat(gridLen) }));
  const gridTab = () => {
    const n = tuning.midi.length;
    const names = tuning.midi.map((m) => pcName(midiToPc(m), useFlats));
    const width = Math.max(...names.map((x) => x.length));
    const rows = Array.from({ length: n }, () => []);
    gridSteps.forEach((v) => {
      let rowIdx = -1; let txt = "-";
      if (v === "P") { rowIdx = n - 1; txt = String(pedalFret); }
      else if (typeof v === "number") {
        const pos = posForMidi(pedalMidi + v);
        if (pos) { rowIdx = n - 1 - pos.string; txt = String(pos.fret); }
      }
      const w = txt === "-" ? 1 : txt.length;
      for (let r = 0; r < n; r++) rows[r].push(r === rowIdx ? txt : "-".repeat(w));
    });
    const header = `Riff \u2014 ${pcName(pedalPc, useFlats)} pedal | ${pcName(rootPc, useFlats)} ${scale.name} | ${tuning.group} ${tuning.name} | ${meter} @ ${bpm}bpm`;
    return `${header}\n\n` + rows.map((cells, r) => `${names[n - 1 - r].padEnd(width)}|--${cells.join("--")}--|`).join("\n");
  };

  // ----- song mode: chain patterns -----
  const parseArrangement = (str) =>
    String(str).toUpperCase().split(/[\s,]+/).filter((x) => ["A", "B", "C", "D"].includes(x)).slice(0, 32);
  const stopSong = () => {
    if (songRef.current.timer) clearTimeout(songRef.current.timer);
    songRef.current.timer = null;
    setSongPlaying(false);
    setSongPos(-1);
    setGridStep(-1);
    setActivePos(null);
  };
  const playSong = () => {
    if (songPlaying) { stopSong(); return; }
    const order = parseArrangement(arrangement);
    if (!order.length) return;
    stopGrid(); stopScale(); stopProg();
    setSongPlaying(true);
    let bar = 0, i = 0;
    const tick = () => {
      const stepMs = 60000 / bpmRef.current / subdivRef.current;
      const groups = parseGroups(meterRef.current);
      const starts = groupStarts(groups);
      const total = groups.reduce((a, b) => a + b, 0);
      const pat = patternsRef.current[order[bar % order.length]];
      const len = pat.g.length;
      const idxNow = i % len;
      const accented = starts.has(i % total);
      setSongPos(bar % order.length);
      setGridStep(idxNow);
      const v = pat.g[idxNow];
      if (v === "P") {
        playMidi(pedalMidi, 0, stepMs / 1000, { mute: true, gain: accented ? 1.35 : 1 });
        setActivePos({ s: 0, f: pedalFret });
      } else if (typeof v === "number") {
        const pos = posForMidi(pedalMidi + v);
        playMidi(pedalMidi + v, 0, Math.min(0.6, (stepMs / 1000) * 1.5), { gain: accented ? 1.3 : 1 });
        setActivePos(pos ? { s: pos.string, f: pos.fret } : null);
      } else setActivePos(null);
      if (drumsOnRef.current) {
        if (pat.d.k[idxNow]) playDrum("k", 0, accented);
        if (pat.d.s[idxNow]) playDrum("s", 0, accented);
        if (pat.d.h[idxNow]) playDrum("h", 0, accented);
      }
      i++;
      if (i >= len) {
        i = 0; bar++;
        if (bar >= order.length) {
          if (!loopRef.current) {
            songRef.current.timer = setTimeout(() => { setSongPlaying(false); setSongPos(-1); setGridStep(-1); setActivePos(null); }, stepMs);
            return;
          }
          bar = 0;
        }
      }
      songRef.current.timer = setTimeout(tick, stepMs);
    };
    tick();
  };

  // ----- MIDI export -----
  const exportMidi = (whole) => {
    const PPQ = 480;
    const ticksPerStep = Math.round((PPQ * 4) / (4 * subdiv)); // one grid step
    const order = whole ? parseArrangement(arrangement) : [curPat];
    const events = [];
    let t = 0;
    order.forEach((key) => {
      const pat = patterns[key];
      pat.g.forEach((v, i) => {
        const at = t + i * ticksPerStep;
        if (v === "P") events.push({ midi: pedalMidi, startTicks: at, durTicks: Math.round(ticksPerStep * 0.5), velocity: 110 });
        else if (typeof v === "number") events.push({ midi: pedalMidi + v, startTicks: at, durTicks: Math.round(ticksPerStep * 0.9), velocity: 100 });
        if (drumsOn) {
          if (pat.d.k[i]) events.push({ midi: 36, startTicks: at, durTicks: 60, channel: 9, velocity: 120 });
          if (pat.d.s[i]) events.push({ midi: 38, startTicks: at, durTicks: 60, channel: 9, velocity: 110 });
          if (pat.d.h[i]) events.push({ midi: 42, startTicks: at, durTicks: 40, channel: 9, velocity: 90 });
        }
      });
      t += pat.g.length * ticksPerStep;
    });
    if (!events.length) { setShareMsg("Nothing to export yet"); setTimeout(() => setShareMsg(""), 1600); return; }
    const ok = downloadBytes(midiFile(events, PPQ), `riff-${pcName(rootPc, useFlats)}-${whole ? "song" : curPat}.mid`);
    setShareMsg(ok ? "MIDI downloaded" : "Download blocked here");
    setTimeout(() => setShareMsg(""), 1800);
  };

  // ----- ASCII tab export -----
  const buildTab = () => {
    const path = applyDirection(buildPath(tuning.midi, rootPc, scale.intervals, octaves, fretCount), direction);
    const n = tuning.midi.length;
    const names = tuning.midi.map((m) => pcName(midiToPc(m), useFlats));
    const width = Math.max(...names.map((x) => x.length));
    // rows: index 0 = highest string
    const rows = Array.from({ length: n }, () => []);
    path.forEach((pos) => {
      const rowIdx = n - 1 - pos.string;
      const txt = String(pos.fret);
      for (let r = 0; r < n; r++) rows[r].push(r === rowIdx ? txt : "-".repeat(txt.length));
    });
    const header = `${pcName(rootPc, useFlats)} ${scale.name}  |  ${tuning.group} ${tuning.name}  |  ${octaves} oct  ${direction === "updown" ? "up+down" : direction}`;
    const body = rows
      .map((cells, r) => `${names[n - 1 - r].padEnd(width)}|--${cells.join("--")}--|`)
      .join("\n");
    return `${header}\n\n${body}`;
  };
  const [tabCopied, setTabCopied] = useState(false);
  const copyTab = async () => {
    const text = buildTab();
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e2) { /* noop */ }
      document.body.removeChild(ta);
    }
    setTabCopied(true);
    setTimeout(() => setTabCopied(false), 1600);
  };

  // ----- reverse scale finder -----
  const [findPcs, setFindPcs] = useState([]);
  const toggleFindPc = (pc) => setFindPcs((prev) => (prev.includes(pc) ? prev.filter((x) => x !== pc) : [...prev, pc].slice(0, 12)));
  const findMatches = () => {
    if (!findPcs.length) return [];
    const out = [];
    for (let r = 0; r < 12; r++) {
      SCALES.forEach((sc, si) => {
        const set = new Set(sc.intervals.map((iv) => (r + iv) % 12));
        const missing = findPcs.filter((pc) => !set.has(pc)).length;
        if (missing === 0) out.push({ root: r, scaleIdx: si, extra: set.size - findPcs.length, size: set.size });
      });
    }
    // fewest extra notes first, then smaller scales, then keep roots that are actually in the selection
    out.sort((a, b) => a.extra - b.extra || a.size - b.size || (findPcs.includes(b.root) ? 1 : 0) - (findPcs.includes(a.root) ? 1 : 0));
    return out.slice(0, 14);
  };

  // ----- harmony line -----
  const [harmony, setHarmony] = useState(0); // 0 = off, 2 = a 3rd up, 4 = a 5th up (scale steps)
  const harmonyRef = useRef(0);
  useEffect(() => { harmonyRef.current = harmony; }, [harmony]);
  // move a pitch up N scale steps, staying in key
  const harmonize = (midi, steps) => {
    const ivs = scale.intervals;
    const pc = midiToPc(midi);
    const deg = ivs.indexOf((pc - rootPc + 12) % 12);
    if (deg < 0) return null;
    const target = deg + steps;
    const oct = Math.floor(target / ivs.length);
    const iv = ivs[((target % ivs.length) + ivs.length) % ivs.length];
    const base = midi - ((pc - rootPc + 12) % 12);
    return base + iv + oct * 12;
  };

  // ----- tuner -----
  const tunerTarget = (() => {
    if (!micPitch) return null;
    let best = null;
    tuning.midi.forEach((m, i) => {
      const d = Math.abs(micPitch.midi - m);
      if (!best || d < best.d) best = { d, idx: i, midi: m };
    });
    if (!best) return null;
    const exact = 69 + 12 * Math.log2(440 * Math.pow(2, (micPitch.midi - 69) / 12) / 440);
    const cents = Math.round((micPitch.midi - best.midi) * 100 + micPitch.cents);
    return { idx: best.idx, midi: best.midi, cents: Math.max(-60, Math.min(60, cents)), off: best.d };
  })();

  // ----- share state -----
  function encodeState() {
    const o = {
      r: rootPc, s: scaleIdx, t: tuningIdx, f: fretCount, l: lefty ? 1 : 0, lo: lowOnTop ? 1 : 0,
      fl: useFlats ? 1 : 0, lm: labelMode === "intervals" ? 1 : 0, m: mode, c: caged || "",
      p: pedalFret, mt: meter, b: bpm, sd: subdiv, o: octaves, d: direction,
      pt: Object.fromEntries(Object.entries(patterns).map(([k, v]) => [k, {
        g: v.g.map((x) => (x === null ? "." : x === "P" ? "P" : String(x))).join(","),
        k: v.d.k.map((b) => (b ? 1 : 0)).join(""),
        s: v.d.s.map((b) => (b ? 1 : 0)).join(""),
        h: v.d.h.map((b) => (b ? 1 : 0)).join(""),
      }])),
      ar: arrangement, hm: harmony, gp: gapMode, dr: drumsOn ? 1 : 0,
    };
    try { return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/=+$/, ""); }
    catch (e) { return ""; }
  }
  function applyState(code) {
    try {
      const json = decodeURIComponent(escape(atob(code.trim())));
      const o = JSON.parse(json);
      if (typeof o.r === "number") setRootPc(o.r);
      if (typeof o.s === "number" && SCALES[o.s]) setScaleIdx(o.s);
      if (typeof o.t === "number" && TUNINGS[o.t]) setTuningIdx(o.t);
      if (typeof o.f === "number") setFretCount(o.f);
      setLefty(!!o.l); setLowOnTop(!!o.lo); setUseFlats(!!o.fl);
      setLabelMode(o.lm ? "intervals" : "notes");
      if (["scale", "riff", "intervals", "quiz", "tuner"].includes(o.m)) setMode(o.m);
      setCaged(o.c || null);
      if (typeof o.p === "number") setPedalFret(o.p);
      if (typeof o.mt === "string") setMeter(o.mt);
      if (typeof o.b === "number") setBpm(o.b);
      if (typeof o.sd === "number") setSubdiv(o.sd);
      if (typeof o.o === "number") setOctaves(o.o);
      if (["up", "down", "updown"].includes(o.d)) setDirection(o.d);
      if (typeof o.ar === "string") setArrangement(o.ar);
      if (typeof o.hm === "number") setHarmony(o.hm);
      if (typeof o.gp === "string") setGapMode(o.gp);
      if (typeof o.dr === "number") setDrumsOn(!!o.dr);
      if (o.pt && typeof o.pt === "object") {
        const out = {};
        let len = 16;
        for (const key of ["A", "B", "C", "D"]) {
          const v = o.pt[key];
          if (!v) { out[key] = emptyPat(len); continue; }
          const g = String(v.g).split(",").map((x) => (x === "." ? null : x === "P" ? "P" : Number(x)));
          len = g.length;
          const lane = (str) => Array.from({ length: g.length }, (_, i) => String(str || "")[i] === "1");
          out[key] = { g, d: { k: lane(v.k), s: lane(v.s), h: lane(v.h) } };
        }
        setGridLen(len);
        setPatterns(out);
      }
      return true;
    } catch (e) { return false; }
  }
  // ----- save slots (persistent) -----
  const [slots, setSlots] = useState([]);
  const [slotName, setSlotName] = useState("");
  const [slotsReady, setSlotsReady] = useState(false);
  const loadSlots = async () => {
    setSlots(await loadJSON("fse:slots", []));
    setSlotsReady(true);
  };
  useEffect(() => { loadSlots(); }, []);
  const writeSlots = async (next) => {
    setSlots(next);
    return saveJSON("fse:slots", next);
  };
  const saveSlot = async () => {
    const name = (slotName || `${pcName(rootPc, useFlats)} ${scale.name}`).slice(0, 40);
    const entry = { name, code: encodeState(), at: Date.now() };
    const next = [entry, ...slots.filter((x) => x.name !== name)].slice(0, 24);
    const ok = await writeSlots(next);
    setSlotName("");
    setShareMsg(ok ? "Saved" : "Couldn't save");
    setTimeout(() => setShareMsg(""), 1600);
  };
  const deleteSlot = async (name) => { await writeSlots(slots.filter((x) => x.name !== name)); };

  const [shareMsg, setShareMsg] = useState("");
  const [loadCode, setLoadCode] = useState("");
  // read a shared state from the URL on first load
  useEffect(() => {
    try {
      const h = window.location.hash;
      if (h && h.length > 2) applyState(h.slice(1));
    } catch (e) { /* sandboxed */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const share = async () => {
    const code = encodeState();
    let text = code;
    try {
      const url = new URL(window.location.href);
      url.hash = code;
      window.history.replaceState(null, "", url.toString());
      text = url.toString();
    } catch (e) { /* sandboxed: share the raw code instead */ }
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e2) { /* noop */ }
      document.body.removeChild(ta);
    }
    setShareMsg(text.startsWith("http") ? "Link copied" : "Code copied");
    setTimeout(() => setShareMsg(""), 1800);
  };

  // ----- microphone -----
  // Keep a live handler in a ref so the rAF loop never sees stale state
  micHandlerRef.current = (freq) => {
    if (freq < 0) { setMicPitch(null); micStableRef.current.count = 0; return; }
    const midi = freqToMidi(freq);
    const pc = midiToPc(midi);
    setMicPitch({ pc, cents: centsOff(freq), midi });
    if (scoreOnRef.current && expectRef.current.pc === pc) expectRef.current.hit = true;
    const st = micStableRef.current;
    if (st.pc === pc) st.count += 1; else { st.pc = pc; st.count = 1; }
    // needs a few consistent frames, and a cooldown so one note isn't counted twice
    const now = performance.now();
    if (st.count === 4 && now - st.lastFire > 600) {
      st.lastFire = now;
      if (mode === "quiz" && quizTarget !== null) answerQuizByPc(pc);
    }
  };
  const toggleMic = async () => {
    if (micOn) { stopMic(); setMicOn(false); setMicPitch(null); return; }
    try {
      setMicErr(null);
      await startMic((f) => micHandlerRef.current(f));
      setMicOn(true);
    } catch (e) {
      setMicErr(e && e.name === "NotAllowedError" ? "Microphone permission denied." : "Microphone unavailable here.");
      setMicOn(false);
    }
  };
  useEffect(() => () => stopMic(), []);

  // ----- quiz -----
  const pickTarget = (pool) => {
    if (!drillWeak) return pool[Math.floor(Math.random() * pool.length)];
    // weight toward notes that get missed most
    const weights = pool.map((pc) => 1 + heat[pc].wrong * 3);
    const sum = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum;
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
    return pool[pool.length - 1];
  };
  const nextQuizTarget = () => {
    const pool = quizScope === "scale" ? [...scaleSet] : [0,1,2,3,4,5,6,7,8,9,10,11];
    let pick = pickTarget(pool);
    if (pool.length > 1 && pick === quizTarget) pick = pool[(pool.indexOf(pick) + 1) % pool.length];
    setQuizTarget(pick);
    setHintLevel(0);
  };
  const startQuiz = () => {
    setQuizScore(0); setQuizTries(0); setQuizStreak(0); setQuizFlash(null);
    setHintLevel(0); setHintsUsed(0);
    const pool = quizScope === "scale" ? [...scaleSet] : [0,1,2,3,4,5,6,7,8,9,10,11];
    setQuizTarget(pickTarget(pool));
  };
  const takeHint = () => {
    if (hintLevel >= 3) return;
    setHintLevel((h) => h + 1);
    setHintsUsed((h) => h + 1);
  };
  const answerQuizByPc = (pc) => {
    if (quizTarget === null) return;
    const correct = pc === quizTarget;
    setHeat((h) => h.map((c, i) => (i === quizTarget ? { right: c.right + (correct ? 1 : 0), wrong: c.wrong + (correct ? 0 : 1) } : c)));
    setQuizTries((t) => t + 1);
    if (correct) {
      setQuizScore((s) => s + 1);
      setQuizStreak((s) => { const n = s + 1; setQuizBest((b) => Math.max(b, n)); return n; });
      setQuizFlash("right");
      setTimeout(() => { setQuizFlash(null); nextQuizTarget(); }, 450);    } else {
      setQuizStreak(0);
      setQuizFlash("wrong");
      setTimeout(() => setQuizFlash(null), 450);
    }
  };

  // ----- fret click router -----
  const onFret = (midi, sLow, fret) => {
    playMidi(midi);
    if (mode === "quiz") answerQuizByPc(midiToPc(midi));
    else if (mode === "intervals") setRefPos({ s: sLow, f: fret, pc: midiToPc(midi), midi });
  };

  // ----- dot rendering logic -----
  const dotFor = (midi, sLow, fret) => {
    const pc = midiToPc(midi);
    if (mode === "quiz") {
      // blank dots — no labels, or the quiz answers itself
      const onHintString = hintLevel >= 2 && hintString !== null && sLow === hintString;
      const isAnswer = hintLevel >= 3 && pc === quizTarget;
      return { kind: "faint", label: "", onHintString, isAnswer };
    }
    if (mode === "intervals") {
      if (!refPos) return scaleSet.has(pc) ? { kind: "scale", isRoot: pc === rootPc, label: pcName(pc, useFlats) } : null;
      const iv = (pc - refPos.pc + 12) % 12;
      const isRef = refPos.s === sLow && refPos.f === fret;
      let kind = "faint";
      if (iv === 0) kind = "octave";
      else if (iv === 7) kind = "fifth";
      else if (iv === 3 || iv === 4) kind = "third";
      return { kind, isRef, label: iv === 0 ? (isRef ? "R" : "8") : INTERVAL_LABELS[iv] };
    }
    if (mode === "riff") {
      if (sLow === 0) {
        // pedal string: highlight the pedal fret itself
        return fret === pedalFret ? { kind: "pedal", label: "P" } : null;
      }
      if (!scaleSet.has(pc)) return null;
      const iv = (pc - pedalPc + 12) % 12;
      return { kind: "scale", isRoot: iv === 0, isTritone: iv === 6, label: INTERVAL_LABELS[iv] };
    }
    if (!scaleSet.has(pc)) return null;
    const interval = (pc - rootPc + 12) % 12;
    return {
      kind: "scale",
      isRoot: interval === 0,
      isTritone: interval === 6,
      isChord: chordSet ? chordSet.has(pc) : false,
      isChordRoot: activeChord ? pc === activeChord.rootPc : false,
      label: labelMode === "notes" ? pcName(pc, useFlats) : INTERVAL_LABELS[interval],
    };
  };

  // ----- quiz hints -----
  // Deterministic "target string": lowest string where the note sits at fret 0-12
  let hintString = null;
  let hintFret = null;
  if (mode === "quiz" && quizTarget !== null) {
    for (let s = 0; s < tuning.midi.length; s++) {
      const f = ((quizTarget - midiToPc(tuning.midi[s])) + 12) % 12;
      if (f <= Math.min(12, fretCount)) { hintString = s; hintFret = f; break; }
    }
  }
  const hintText = (() => {
    if (mode !== "quiz" || quizTarget === null || hintLevel === 0) return null;
    const iv = (quizTarget - rootPc + 12) % 12;
    const inScale = scaleSet.has(quizTarget);
    if (hintLevel === 1) {
      return inScale
        ? `It's the ${INTERVAL_LABELS[iv]} of ${pcName(rootPc, useFlats)} ${scale.name} \u2014 already lit when you're in Scales mode.`
        : `It's not in ${pcName(rootPc, useFlats)} ${scale.name}. It sits a ${INTERVAL_FULL[iv].toLowerCase()} above ${pcName(rootPc, useFlats)}.`;
    }
    if (hintString === null) return "It's somewhere on the neck \u2014 try the middle strings.";
    const openName = pcName(midiToPc(tuning.midi[hintString]), useFlats);
    const strNum = tuning.midi.length - hintString; // conventional: 1 = highest string
    if (hintLevel === 2) {
      return `Look on the open ${openName} string (string ${strNum}) \u2014 it's within the first 12 frets.`;
    }
    return `Answer: open ${openName} string (string ${strNum}), fret ${hintFret}. Every octave of it is ringed on the board.`;
  })();

  // styles live in ../styles.css


  const board = (
    <div className="fse-board-scroll" ref={boardRef}>
      <div className={`fse-board ${lefty ? "lefty" : ""}`} style={{ "--cw": `${cellW}px` }}>
        {strings.map((openMidi, sIdx) => {
          const sLow = lowOnTop ? sIdx : strings.length - 1 - sIdx;
          const thickness = 1 + ((strings.length - 1 - (lowOnTop ? strings.length - 1 - sIdx : sIdx)) / (strings.length - 1)) * 2.4;
          const midString = Math.floor(strings.length / 2);
          return (
            <div className="fse-row" key={sIdx}>
              {Array.from({ length: fretCount + 1 }, (_, fret) => {
                const midi = openMidi + fret;
                const dot = dotFor(midi, sLow, fret);
                const inPos = posFrets ? posFrets.has(fret) : true;
                const isSounding = activePos && activePos.f === fret && activePos.s === sLow;
                const cls = [
                  "fse-fretbtn",
                  dot ? (dot.kind === "scale" ? (dot.isRoot ? "root" : "in-scale") : dot.kind) : "",
                  dot && dot.kind === "scale" && chordSet ? (dot.isChordRoot ? "chord-root" : dot.isChord ? "chord-tone" : "nonchord") : "",
                  dot && dot.isTritone ? "tritone" : "",
                  dot && dot.onHintString ? "hintstring" : "",
                  dot && dot.isAnswer ? "hintanswer" : "",
                  dot && dot.isRef ? "isref" : "",
                  dot && mode === "scale" && !inPos ? "dim" : "",
                  isSounding ? "sounding" : "",
                  harmonyPos && harmonyPos.string === sLow && harmonyPos.fret === fret ? "harm" : "",
                ].filter(Boolean).join(" ");
                return (
                  <div className={`fse-cell ${fret === 0 ? "open" : ""} ${posFrets && inPos ? "in-pos" : ""}`} key={fret}>
                    <div className="fse-stringline" style={{ height: `${thickness}px`, opacity: fret === 0 ? 0.35 : 1 }} />
                    {fret === 0 ? <div className="fse-nut" /> : <div className="fse-fretwire" />}
                    {sIdx === midString && fret > 0 && INLAY_FRETS.includes(fret) && <div className="fse-inlay" />}
                    {sIdx === midString && DOUBLE_INLAY.includes(fret) && (<><div className="fse-inlay d1" /><div className="fse-inlay d2" /></>)}
                    <button
                      className={cls}
                      onClick={() => onFret(midi, sLow, fret)}
                      aria-label={`String ${sLow + 1}, fret ${fret}, ${pcName(midiToPc(midi), useFlats)}`}
                    >
                      <span className="fse-lbl">{dot ? dot.label : ""}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
        <div className="fse-numbers">
          {Array.from({ length: fretCount + 1 }, (_, f) => (
            <div className={`fse-num ${f === 0 ? "open" : ""}`} key={f}>{f}</div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="fse-wrap">

      {/* ---------- top bar: title, mode tabs, settings ---------- */}
      <div className="fse-topbar fse-noprint">
        <h1 className="fse-title">Fretboard</h1>
        <div className="fse-tabs" role="tablist" aria-label="Mode">
          <button className={mode === "scale" ? "on" : ""} onClick={() => { setMode("scale"); stopScale(); }}>Scales</button>
          <button className={mode === "riff" ? "on" : ""} onClick={() => { setMode("riff"); stopScale(); stopProg(); }}>Riff</button>
          <button className={mode === "intervals" ? "on" : ""} onClick={() => { setMode("intervals"); stopScale(); stopProg(); setRefPos(null); }}>Intervals</button>
          <button className={mode === "quiz" ? "on" : ""} onClick={() => { setMode("quiz"); stopScale(); stopProg(); startQuiz(); }}>Quiz</button>
          <button className={mode === "tuner" ? "on" : ""} onClick={() => { setMode("tuner"); stopScale(); stopProg(); if (!micOn) toggleMic(); }}>Tuner</button>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className={`fse-iconbtn ${settingsOpen ? "on" : ""}`} onClick={() => setSettingsOpen(!settingsOpen)} aria-expanded={settingsOpen}>&#9881;</button>
          <button className={`fse-iconbtn ${micOn ? "on" : ""}`} onClick={toggleMic} title="Listen to my guitar">&#127908;</button>
          <button className="fse-iconbtn" onClick={share} title="Copy shareable link">&#128279;</button>
          <button className="fse-iconbtn" onClick={() => window.print()} title="Print chart">&#128424;</button>
        </div>
      </div>

      {(micOn || micErr || shareMsg) && (
        <div className="fse-micbar fse-noprint">
          {shareMsg && <span className="fse-micok">{shareMsg}</span>}
          {micErr && <span className="fse-micerr">{micErr}</span>}
          {micOn && (
            <>
              <span className="fse-micdot" />
              <span className="fse-hint">Listening</span>
              <span className="fse-micnote">{micPitch ? pcName(micPitch.pc, useFlats) : "\u2014"}</span>
              {micPitch && (
                <span className={`fse-cents ${Math.abs(micPitch.cents) <= 6 ? "intune" : ""}`}>
                  {micPitch.cents > 0 ? "+" : ""}{micPitch.cents}\u00A2
                </span>
              )}
              <span className="fse-hint">
                {mode === "quiz" ? "Play the note on your guitar to answer." : "Play a note \u2014 it's matched against the board."}
              </span>
            </>
          )}
        </div>
      )}

      {/* ---------- settings drawer ---------- */}
      {settingsOpen && (
        <div className="fse-drawer fse-noprint">
          <div className="fse-drawer-row">
            <span className="fse-tag">Labels</span>
            <div className="fse-toggle" role="group" aria-label="Label mode">
              <button className={labelMode === "notes" ? "on" : ""} onClick={() => setLabelMode("notes")}>Notes</button>
              <button className={labelMode === "intervals" ? "on" : ""} onClick={() => setLabelMode("intervals")}>Intervals</button>
            </div>
            <div className="fse-toggle" role="group" aria-label="Accidentals">
              <button className={!useFlats ? "on" : ""} onClick={() => setUseFlats(false)}>&#9839; Sharps</button>
              <button className={useFlats ? "on" : ""} onClick={() => setUseFlats(true)}>&#9837; Flats</button>
            </div>
          </div>
          <div className="fse-drawer-row">
            <span className="fse-tag">Mic</span>
            <button className={`fse-pill ${micOn ? "active" : ""}`} onClick={toggleMic} aria-pressed={micOn}>
              {micOn ? "Listening \u2014 stop" : "Listen to my guitar"}
            </button>
            <span className="fse-hint">Answers quiz notes by ear and shows live pitch.</span>
          </div>
          <div className="fse-drawer-row">
            <span className="fse-tag">Share</span>
            <button className="fse-pill" onClick={share}>Copy link</button>
            <input className="fse-select" style={{ flex: "1 1 160px", minWidth: 140, padding: "7px 8px", fontSize: 12 }}
              value={loadCode} onChange={(e) => setLoadCode(e.target.value)} placeholder="paste a code or link" aria-label="Load shared state" />
            <button className="fse-pill" onClick={() => {
              const raw = loadCode.includes("#") ? loadCode.split("#").pop() : loadCode;
              setShareMsg(applyState(raw) ? "Loaded" : "Couldn't read that code");
              setTimeout(() => setShareMsg(""), 1800);
            }}>Load</button>
          </div>
          <div className="fse-drawer-row">
            <span className="fse-tag">Tone</span>
            <div className="fse-toggle" role="group" aria-label="Tone">
              <button className={!drive ? "on" : ""} onClick={() => setDrive(false)}>Clean</button>
              <button className={drive ? "on" : ""} onClick={() => setDrive(true)}>Distortion</button>
            </div>
            <button className={`fse-pill ${palmMute ? "active" : ""}`} onClick={() => setPalmMute(!palmMute)} aria-pressed={palmMute}>
              Palm mute
            </button>
            <button className={`fse-pill ${droneOn ? "active" : ""}`} onClick={() => setDroneOn(!droneOn)} aria-pressed={droneOn}>
              Root drone
            </button>
          </div>
          <div className="fse-drawer-row">
            <span className="fse-tag">Neck</span>
            <div className="fse-toggle" role="group" aria-label="Fret count">
              {[12, 15, 22, 24].map((f) => (
                <button key={f} className={fretCount === f ? "on" : ""} onClick={() => setFretCount(f)}>{f}f</button>
              ))}
            </div>
            <div className="fse-toggle" role="group" aria-label="Handedness">
              <button className={!lefty ? "on" : ""} onClick={() => setLefty(false)}>Right</button>
              <button className={lefty ? "on" : ""} onClick={() => setLefty(true)}>Left</button>
            </div>
            <div className="fse-toggle" role="group" aria-label="String order">
              <button className={!lowOnTop ? "on" : ""} onClick={() => setLowOnTop(false)}>High on top</button>
              <button className={lowOnTop ? "on" : ""} onClick={() => setLowOnTop(true)}>Low on top</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- key row: root, scale, tuning ---------- */}
      <div className="fse-row-controls fse-noprint">
        <select className="fse-select" value={rootPc} onChange={(e) => setRootPc(Number(e.target.value))} aria-label="Root note">
          {SHARP_NAMES.map((_, i) => <option key={i} value={i}>{pcName(i, useFlats)}</option>)}
        </select>
        <select className="fse-select" value={scaleIdx} onChange={(e) => { setScaleIdx(Number(e.target.value)); setChordIdx(null); setProgChord(null); }} aria-label="Scale">
          {SCALE_GROUPS.map((g) => (
            <optgroup key={g} label={g}>
              {SCALES.map((sc, i) => (sc.group === g ? <option key={i} value={i}>{sc.name}</option> : null))}
            </optgroup>
          ))}
        </select>
        <select className="fse-select" value={tuningIdx} onChange={(e) => setTuningIdx(Number(e.target.value))} aria-label="Tuning">
          {TUNING_GROUPS.map((g) => (
            <optgroup key={g} label={g}>
              {TUNINGS.map((t, i) => (t.group === g ? <option key={i} value={i}>{t.name}</option> : null))}
            </optgroup>
          ))}
        </select>
        {mode === "scale" && (
          <select className="fse-select" value={caged || ""} onChange={(e) => setCaged(e.target.value || null)} aria-label="Position">
            <option value="">All positions</option>
            {CAGED_ORDER.map((s) => (
              <option key={s} value={s}>{`${s} shape \u00B7 Pos ${SHAPE_TO_POSITION[s]}`}</option>
            ))}
          </select>
        )}
      </div>

      {/* ---------- transport (scale mode) ---------- */}
      {mode === "scale" && (
        <div className="fse-transport fse-noprint">
          <button className="fse-play" onClick={playScale}>{playing ? "\u25A0 Stop" : "\u25B6 Play"}</button>
          <button className={`fse-pill ${loop ? "active" : ""}`} onClick={() => setLoop(!loop)} aria-pressed={loop} title="Loop">&#10227;</button>
          <div className="fse-toggle" role="group" aria-label="Direction">
            <button className={direction === "up" ? "on" : ""} onClick={() => setDirection("up")}>&uarr;</button>
            <button className={direction === "down" ? "on" : ""} onClick={() => setDirection("down")}>&darr;</button>
            <button className={direction === "updown" ? "on" : ""} onClick={() => setDirection("updown")}>&updownarrow;</button>
          </div>
          <div className="fse-toggle" role="group" aria-label="Subdivision">
            {[[1, "\u2669"], [2, "\u266B"], [3, "3"], [4, "16"]].map(([v, lbl]) => (
              <button key={v} className={subdiv === v ? "on" : ""} onClick={() => setSubdiv(v)}
                title={v === 1 ? "Quarter notes" : v === 2 ? "Eighth notes" : v === 3 ? "Triplets" : "Sixteenth notes"}>{lbl}</button>
            ))}
          </div>
          <div className="fse-toggle" role="group" aria-label="Octaves">
            <button className={octaves === 1 ? "on" : ""} onClick={() => setOctaves(1)}>1&times;</button>
            <button className={octaves === 2 ? "on" : ""} onClick={() => setOctaves(2)}>2&times;</button>
          </div>

          <div className="fse-div" />

          <div className="fse-toggle" role="group" aria-label="Harmony">
            <button className={harmony === 0 ? "on" : ""} onClick={() => setHarmony(0)} title="No harmony">Solo</button>
            <button className={harmony === 2 ? "on" : ""} onClick={() => setHarmony(2)} title="Harmony a 3rd above">+3rd</button>
            <button className={harmony === 4 ? "on" : ""} onClick={() => setHarmony(4)} title="Harmony a 5th above">+5th</button>
          </div>
          <select className="fse-select" style={{ padding: "7px 8px", fontSize: 12 }} value={gapMode}
            onChange={(e) => setGapMode(e.target.value)} aria-label="Gap trainer">
            <option value="off">No gaps</option>
            <option value="1:1">Gap 1 on / 1 off</option>
            <option value="2:2">Gap 2 on / 2 off</option>
            <option value="3:1">Gap 3 on / 1 off</option>
          </select>
          <select className="fse-select" style={{ padding: "7px 8px", fontSize: 12 }} value={meter}
            onChange={(e) => setMeter(e.target.value)} aria-label="Meter">
            {METER_PRESETS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            {!METER_PRESETS.some((m) => m.value === meter) && <option value={meter}>{meter}</option>}
          </select>
          <button className={`fse-pill ${speedTrain ? "active" : ""}`} onClick={() => setSpeedTrain(!speedTrain)}
            title="Speed trainer: +5 BPM every 2 loops" aria-pressed={speedTrain}>&#9195; +5</button>
          <button className={`fse-pill ${drive ? "active" : ""}`} onClick={() => setDrive(!drive)} title="Distortion" aria-pressed={drive}>Dist</button>
          <button className={`fse-pill ${palmMute ? "active" : ""}`} onClick={() => setPalmMute(!palmMute)} title="Palm mute" aria-pressed={palmMute}>PM</button>
          <div className="fse-div" />
          <button className={`fse-pill ${metroOn ? "active" : ""}`} onClick={metroOn ? stopMetro : startMetro} title="Metronome">
            {metroOn ? "\u25A0" : "\u25B6"} Click
          </button>
          <button className="fse-pill" onClick={tapTempo} title="Tap tempo">Tap</button>
          <span><span className="fse-bpm-num">{bpm}</span><span className="fse-bpm-label">BPM</span></span>
          <input type="range" min="40" max="240" value={bpm} onChange={(e) => setBpm(Number(e.target.value))} className="fse-slider" aria-label="Tempo" />
          {gapSilent && <span className="fse-gaptag">SILENT</span>}
          <div className="fse-beats" aria-hidden="true">
            {(() => {
              const groups = parseGroups(meter);
              const total = groups.reduce((a, b) => a + b, 0);
              const starts = groupStarts(groups);
              return Array.from({ length: Math.min(total, 16) }, (_, b) => (
                <span key={b} className={`fse-beat ${starts.has(b) ? "grp" : ""} ${beatFlash === b ? (b === 0 ? "hit accent" : "hit") : ""}`} />
              ));
            })()}
          </div>
        </div>
      )}

      {mode === "scale" && (scoreOn || micOn) && (
        <div className="fse-micbar fse-noprint">
          <button className={`fse-pill ${scoreOn ? "active" : ""}`} onClick={() => { setScoreOn(!scoreOn); setScore({ hits: 0, total: 0, streak: 0 }); }} aria-pressed={scoreOn}>
            {scoreOn ? "Scoring on" : "Score my playing"}
          </button>
          {scoreOn && !micOn && <span className="fse-micerr">Turn the mic on to be scored.</span>}
          {scoreOn && score.total > 0 && (
            <>
              <span className="fse-stat"><b>{Math.round((score.hits / score.total) * 100)}%</b>accuracy</span>
              <span className="fse-stat"><b>{score.hits}/{score.total}</b>notes</span>
              <span className="fse-stat"><b>{score.streak}</b>streak</span>
            </>
          )}
          {scoreOn && micOn && score.total === 0 && <span className="fse-hint">Hit play and follow along on your guitar.</span>}
        </div>
      )}

      {/* ---------- riff bar ---------- */}
      {mode === "riff" && (
        <div className="fse-transport fse-noprint">
          <button className="fse-play" onClick={playRiff}>{playing ? "\u25A0 Stop" : "\u25B6 Play riff"}</button>
          <button className={`fse-pill ${loop ? "active" : ""}`} onClick={() => setLoop(!loop)} aria-pressed={loop} title="Loop">&#10227;</button>
          <span className="fse-hint">Pedal:</span>
          <div className="fse-toggle" role="group" aria-label="Pedal fret">
            {[0, 1, 2, 3, 5].map((f) => (
              <button key={f} className={pedalFret === f ? "on" : ""} onClick={() => setPedalFret(f)}>
                {f === 0 ? "open" : f}
              </button>
            ))}
          </div>
          <span className="fse-hint">{pcName(pedalPc, useFlats)} on the lowest string</span>
          <div className="fse-div" />
          <div className="fse-toggle" role="group" aria-label="Subdivision">
            {[[1, "\u2669"], [2, "\u266B"], [3, "3"], [4, "16"]].map(([v, lbl]) => (
              <button key={v} className={subdiv === v ? "on" : ""} onClick={() => setSubdiv(v)}>{lbl}</button>
            ))}
          </div>
          <button className={`fse-pill ${drive ? "active" : ""}`} onClick={() => setDrive(!drive)} aria-pressed={drive}>Dist</button>
          <button className={`fse-pill ${palmMute ? "active" : ""}`} onClick={() => setPalmMute(!palmMute)} aria-pressed={palmMute}>PM</button>
          <button className={`fse-pill ${droneOn ? "active" : ""}`} onClick={() => setDroneOn(!droneOn)} aria-pressed={droneOn}>Drone</button>
          <span><span className="fse-bpm-num">{bpm}</span><span className="fse-bpm-label">BPM</span></span>
          <input type="range" min="40" max="240" value={bpm} onChange={(e) => setBpm(Number(e.target.value))} className="fse-slider" aria-label="Tempo" />
        </div>
      )}

      {mode === "riff" && (
        <div className="fse-riffgrid fse-noprint">
          <div className="fse-drawer-row" style={{ marginBottom: 10 }}>
            <span className="fse-tag">Meter</span>
            <select className="fse-select" style={{ padding: "7px 8px", fontSize: 12 }} value={METER_PRESETS.some((m) => m.value === meter) ? meter : "custom"}
              onChange={(e) => { if (e.target.value !== "custom") setMeter(e.target.value); }} aria-label="Meter preset">
              {METER_PRESETS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              <option value="custom">Custom\u2026</option>
            </select>
            <input className="fse-select" style={{ width: 130, padding: "7px 8px", fontSize: 12 }} value={meter}
              onChange={(e) => setMeter(e.target.value)} aria-label="Custom grouping" placeholder="3+2+2" />
            <span className="fse-hint">
              {(() => { const g = parseGroups(meter); return `${g.reduce((a, b) => a + b, 0)} beats \u00B7 accents on ${g.join(" + ")}`; })()}
            </span>
          </div>

          <div className="fse-drawer-row" style={{ marginBottom: 10 }}>
            <span className="fse-tag">Pattern</span>
            <div className="fse-toggle" role="group" aria-label="Pattern">
              {["A", "B", "C", "D"].map((k) => (
                <button key={k} className={curPat === k ? "on" : ""} onClick={() => setCurPat(k)}>{k}</button>
              ))}
            </div>
            <button className={`fse-pill ${drumsOn ? "active" : ""}`} onClick={() => setDrumsOn(!drumsOn)} aria-pressed={drumsOn}>Drums</button>
            <span className="fse-tag">Song</span>
            <input className="fse-select" style={{ width: 120, padding: "7px 8px", fontSize: 12 }} value={arrangement}
              onChange={(e) => setArrangement(e.target.value)} placeholder="A A B A" aria-label="Arrangement" />
            <button className="fse-play" onClick={playSong}>{songPlaying ? "\u25A0 Stop song" : "\u25B6 Play song"}</button>
            {songPlaying && (
              <span className="fse-hint">
                bar {songPos + 1}/{parseArrangement(arrangement).length} \u00B7 {parseArrangement(arrangement)[songPos] || ""}
              </span>
            )}
          </div>

          <div className="fse-drawer-row" style={{ marginBottom: 10 }}>
            <span className="fse-tag">Steps</span>
            <div className="fse-toggle" role="group" aria-label="Grid length">
              {[8, 12, 16].map((n) => (
                <button key={n} className={gridLen === n ? "on" : ""} onClick={() => setGridLen(n)}>{n}</button>
              ))}
            </div>
            <span className="fse-tag">Brush</span>
            <div className="fse-brushes">
              <button className={`fse-brush ${brush === "P" ? "on" : ""}`} onClick={() => setBrush("P")} title="Pedal (chug)">P</button>
              <button className={`fse-brush ${brush === null ? "on" : ""}`} onClick={() => setBrush(null)} title="Rest">&middot;</button>
              {scale.intervals.filter((iv) => iv !== 0).map((iv) => (
                <button key={iv} className={`fse-brush ${brush === iv ? "on" : ""} ${iv === 6 ? "tri" : ""}`}
                  onClick={() => setBrush(iv)} title={PEDAL_CHARACTER[iv]}>{INTERVAL_LABELS[iv]}</button>
              ))}
              {scale.intervals.includes(0) && (
                <button className={`fse-brush ${brush === 12 ? "on" : ""}`} onClick={() => setBrush(12)} title="Octave above pedal">8</button>
              )}
            </div>
          </div>

          <div className="fse-steps">
            {gridSteps.map((v, i) => {
              const groups = parseGroups(meter);
              const starts = groupStarts(groups);
              const total = groups.reduce((a, b) => a + b, 0);
              const isAccent = starts.has(i % total);
              return (
                <button key={i}
                  className={`fse-step ${v === null ? "rest" : v === "P" ? "ped" : "note"} ${v === 6 ? "tri" : ""} ${gridStep === i ? "now" : ""} ${isAccent ? "accent" : ""}`}
                  onClick={() => {
                    setGridSteps((prev) => { const n = [...prev]; n[i] = n[i] === brush ? null : brush; return n; });
                    if (brush === "P") playMidi(pedalMidi, 0, 0.2, { mute: true });
                    else if (typeof brush === "number") playMidi(pedalMidi + brush, 0, 0.4);
                  }}
                  aria-label={`Step ${i + 1}`}>
                  {v === null ? "" : v === "P" ? "P" : v === 12 ? "8" : INTERVAL_LABELS[v]}
                </button>
              );
            })}
          </div>

          {[["k", "Kick"], ["s", "Snare"], ["h", "Hat"]].map(([lane, label]) => (
            <div className="fse-drumrow" key={lane}>
              <span className="fse-drumlabel">{label}</span>
              <div className="fse-steps">
                {drumSteps[lane].map((on, i) => {
                  const groups = parseGroups(meter);
                  const starts = groupStarts(groups);
                  const total = groups.reduce((a, b) => a + b, 0);
                  return (
                    <button key={i}
                      className={`fse-step drum ${lane} ${on ? "on" : ""} ${gridStep === i ? "now" : ""} ${starts.has(i % total) ? "accent" : ""}`}
                      onClick={() => { toggleDrum(lane, i); if (!on) playDrum(lane); }}
                      aria-label={`${label} step ${i + 1}`} />
                  );
                })}
              </div>
            </div>
          ))}

          <div className="fse-drawer-row" style={{ marginTop: 10 }}>
            <button className="fse-play" onClick={playGrid}>{gridPlaying ? "\u25A0 Stop riff" : "\u25B6 Play riff"}</button>
            <button className={`fse-pill ${loop ? "active" : ""}`} onClick={() => setLoop(!loop)} aria-pressed={loop}>&#10227; Loop</button>
            <button className="fse-pill" onClick={clearGrid}>Clear</button>
            <button className="fse-pill" onClick={async () => {
              const t = gridTab();
              try { await navigator.clipboard.writeText(t); } catch (e) {
                const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select();
                try { document.execCommand("copy"); } catch (e2) { /* noop */ }
                document.body.removeChild(ta);
              }
              setShareMsg("Riff tab copied"); setTimeout(() => setShareMsg(""), 1600);
            }}>Copy riff tab</button>
            <button className="fse-pill" onClick={() => exportMidi(false)}>MIDI: pattern</button>
            <button className="fse-pill" onClick={() => exportMidi(true)}>MIDI: song</button>
            <span className="fse-hint">Tap steps to paint. Accented steps are outlined.</span>
          </div>
        </div>
      )}

      {/* ---------- quiz bar ---------- */}
      {mode === "quiz" && (
        <div className="fse-transport fse-noprint">
          <span className="fse-hint">Find:</span>
          <span className={`fse-quiz-note ${quizFlash || ""}`}>
            {quizFlash === "wrong" ? "\u2715" : quizFlash === "right" ? "\u2713" : quizTarget !== null ? pcName(quizTarget, useFlats) : "\u2013"}
          </span>
          <div className="fse-div" />
          <div className="fse-stat"><b>{quizScore}/{quizTries}</b>correct</div>
          <div className="fse-stat"><b>{quizStreak}</b>streak</div>
          <div className="fse-stat"><b>{quizBest}</b>best</div>
          <div className="fse-stat"><b>{hintsUsed}</b>hints</div>
          <div className="fse-div" />
          <button className={`fse-pill ${hintLevel > 0 ? "active" : ""}`} onClick={takeHint} disabled={hintLevel >= 3}>
            {hintLevel >= 3 ? "Answer shown" : `\u{1F4A1} Hint ${hintLevel}/3`}
          </button>
          <div className="fse-toggle" role="group" aria-label="Quiz scope">
            <button className={quizScope === "all" ? "on" : ""} onClick={() => setQuizScope("all")}>All</button>
            <button className={quizScope === "scale" ? "on" : ""} onClick={() => setQuizScope("scale")}>In scale</button>
          </div>
          <button className="fse-pill" onClick={nextQuizTarget}>Skip</button>
          <button className={`fse-pill ${drillWeak ? "active" : ""}`} onClick={() => setDrillWeak(!drillWeak)} aria-pressed={drillWeak} title="Bias toward notes you miss">Drill weak</button>
          <button className="fse-pill" onClick={startQuiz}>Reset</button>
        </div>
      )}

      {mode === "quiz" && heat.some((c) => c.right + c.wrong > 0) && (
        <div className="fse-heat fse-noprint">
          <span className="fse-tag">Heat map</span>
          {heat.map((c, pc) => {
            const tries = c.right + c.wrong;
            const rate = tries ? c.right / tries : -1;
            const cls = tries === 0 ? "none" : rate >= 0.8 ? "good" : rate >= 0.5 ? "mid" : "bad";
            return (
              <span key={pc} className={`fse-heatcell ${cls}`} title={tries ? `${c.right}/${tries} correct` : "not tested"}>
                {pcName(pc, useFlats)}
              </span>
            );
          })}
          <button className="fse-pill" onClick={() => setHeat(Array.from({ length: 12 }, () => ({ right: 0, wrong: 0 })))}>Clear</button>
        </div>
      )}

      {mode === "quiz" && hintText && (
        <div className="fse-hintbar fse-noprint">
          <span className="fse-hintnum">{hintLevel}</span>
          <span>{hintText}</span>
        </div>
      )}

      {/* ---------- intervals bar ---------- */}
      {mode === "intervals" && (
        <div className="fse-transport fse-noprint">
          <span className="fse-hint">
            {refPos
              ? `From ${pcName(refPos.pc, useFlats)} \u2014 string ${tuning.midi.length - refPos.s}, fret ${refPos.f}`
              : "Tap any fret to set the reference note"}
          </span>
          {refPos && <button className="fse-pill" onClick={() => setRefPos(null)}>Clear</button>}
        </div>
      )}

      {/* ---------- tuner ---------- */}
      {mode === "tuner" ? (
        <div className="fse-tuner">
          {!micOn && (
            <div className="fse-ivinfo" style={{ marginTop: 0 }}>
              Turn on the mic (&#127908; up top) and play a string.
              {micErr && <span className="fse-micerr"> {micErr}</span>}
            </div>
          )}
          <div className="fse-tunernote">
            {tunerTarget ? pcName(midiToPc(tunerTarget.midi), useFlats) : "\u2014"}
          </div>
          <div className="fse-meter">
            <div className="fse-meter-track">
              <div className="fse-meter-center" />
              <div className="fse-meter-needle"
                style={{ left: `calc(50% + ${tunerTarget ? tunerTarget.cents : 0}% * 0.8)`,
                         background: tunerTarget && Math.abs(tunerTarget.cents) <= 5 ? "#5FD3C4" : "#FFB347",
                         opacity: tunerTarget ? 1 : 0.25 }} />
            </div>
            <div className="fse-meter-labels"><span>&#9837; flat</span><span>in tune</span><span>sharp &#9839;</span></div>
          </div>
          <div className="fse-tunerval">
            {tunerTarget
              ? (Math.abs(tunerTarget.cents) <= 5 ? "In tune" : `${tunerTarget.cents > 0 ? "+" : ""}${tunerTarget.cents} cents`)
              : "listening\u2026"}
          </div>
          <div className="fse-strings">
            {[...tuning.midi].map((m, i) => (
              <button key={i} className={`fse-stringbtn ${tunerTarget && tunerTarget.idx === i ? "on" : ""}`}
                onClick={() => playMidi(m, 0, 1.4, { drive: false, mute: false })}>
                <span className="fse-strnum">{tuning.midi.length - i}</span>
                <span className="fse-strname">{pcName(midiToPc(m), useFlats)}</span>
              </button>
            ))}
          </div>
          <div className="fse-ivinfo">
            Tuning to {tuning.group} {tuning.name}. Tap a string to hear its reference pitch.
          </div>
        </div>
      ) : board}

      <div className="fse-legend">
        {mode === "intervals" && refPos ? (
          <>
            <span><span className="fse-dotkey" style={{ background: "radial-gradient(circle at 35% 30%,#FFD48A,#F09A2E)" }} />Octave</span>
            <span><span className="fse-dotkey" style={{ background: "#5FD3C4" }} />5th</span>
            <span><span className="fse-dotkey" style={{ background: "#C79BE8" }} />3rds</span>
            <span><span className="fse-dotkey" style={{ background: "#3A332A" }} />Other</span>
          </>
        ) : mode === "riff" ? (
          <>
            <span><span className="fse-dotkey" style={{ background: "#8C6BE8" }} />Pedal note</span>
            <span><span className="fse-dotkey" style={{ background: "#E5544A" }} />b5 tritone</span>
            <span><span className="fse-dotkey" style={{ background: "#E8E0CE" }} />Interval above pedal</span>
          </>
        ) : mode === "quiz" ? (
          <span>Tap the fret you think it is &mdash; anywhere on the neck counts.</span>
        ) : (
          <>
            <span><span className="fse-dotkey" style={{ background: "radial-gradient(circle at 35% 30%,#FFD48A,#F09A2E)" }} />Root</span>
            <span><span className="fse-dotkey" style={{ background: "#E8E0CE" }} />Scale tone</span>
            {activeChord && <span><span className="fse-dotkey" style={{ background: "#5FD3C4" }} />Chord tone</span>}
            {caged && <span>{caged} shape &middot; frets {posRanges.map(([a, b]) => (a === b ? `${a}` : `${a}\u2013${b}`)).join(" & ")}</span>}
          </>
        )}
      </div>

      {/* ---------- tabbed info panel ---------- */}
      {mode === "scale" && (
        <div className="fse-panel">
          <div className="fse-paneltabs fse-noprint" role="tablist">
            <button className={panelTab === "scale" ? "on" : ""} onClick={() => setPanelTab("scale")}>Scale</button>
            <button className={panelTab === "chords" ? "on" : ""} onClick={() => setPanelTab("chords")}>Chords</button>
            <button className={panelTab === "prog" ? "on" : ""} onClick={() => setPanelTab("prog")}>Progressions</button>
            <button className={panelTab === "tab" ? "on" : ""} onClick={() => setPanelTab("tab")}>Tab</button>
            <button className={panelTab === "amp" ? "on" : ""} onClick={() => setPanelTab("amp")}>Amp</button>
            <button className={panelTab === "find" ? "on" : ""} onClick={() => setPanelTab("find")}>Find scale</button>
            <button className={panelTab === "saved" ? "on" : ""} onClick={() => setPanelTab("saved")}>Saved</button>
          </div>
          <div className="fse-panelbody">
            {panelTab === "scale" && (
              <>
                <div className="fse-section-label">
                  {pcName(rootPc, useFlats)} {scale.name} &mdash;{" "}
                  {scale.intervals.map((iv, i) => (
                    <span key={i} className={activeIv === iv ? "fse-iv-live" : ""}>
                      {INTERVAL_LABELS[iv]}{i < scale.intervals.length - 1 ? " \u00B7 " : ""}
                    </span>
                  ))}
                </div>
                <div className="fse-readout-notes">
                  {scale.intervals.map((iv, i) => (
                    <span key={i} className={`fse-note-chip ${i === 0 ? "root" : ""} ${activeIv === iv ? "live" : ""}`}>
                      {pcName((rootPc + iv) % 12, useFlats)}
                    </span>
                  ))}
                </div>
              </>
            )}

            {panelTab === "chords" && (
              <>
                <div className="fse-row-controls" style={{ marginBottom: 12 }}>
                  <div className="fse-toggle" role="group" aria-label="Chord style">
                    <button className={chordStyle === "power" ? "on" : ""} onClick={() => { setChordStyle("power"); setChordIdx(null); setProgChord(null); }}>Power (5)</button>
                    <button className={chordStyle === "triad" ? "on" : ""} onClick={() => { setChordStyle("triad"); setChordIdx(null); setProgChord(null); }}>Triads</button>
                  </div>
                  <span className="fse-hint">
                    {scale.intervals.length < 7 ? "built from the parent scale" : `in ${pcName(rootPc, useFlats)} ${scale.name}`}
                  </span>
                </div>
                <div className="fse-chordgrid">
                  <button className={`fse-chord ${chordIdx === null && !progChord ? "active" : ""}`} onClick={() => { setChordIdx(null); setProgChord(null); }}>
                    <span className="fse-chord-name">Off</span>
                    <span className="fse-chord-rn">no overlay</span>
                  </button>
                  {chordList.map((c, i) => (
                    <button key={i} className={`fse-chord ${chordIdx === i ? "active" : ""}`}
                      onClick={() => {
                        if (progPlaying) stopProg();
                        setProgChord(null);
                        setChordIdx(chordIdx === i ? null : i);
                        if (chordStyle === "power") playPower(c.rootPc); else playChord(c.pcs, c.rootPc);
                      }}>
                      <span className="fse-chord-name">{pcName(c.rootPc, useFlats)}{c.suffix}</span>
                      <span className="fse-chord-rn">{c.roman}</span>
                    </button>
                  ))}
                </div>
                {activeChord && (
                  <div className="fse-ivinfo">
                    {pcName(activeChord.rootPc, useFlats)}{activeChord.suffix}: {activeChord.pcs.map((x) => pcName(x, useFlats)).join(" \u00B7 ")}
                    {chordStyle === "power" && (() => {
                      const g = powerGrip(activeChord.rootPc);
                      if (!g) return null;
                      const strNum = tuning.midi.length - g.string;
                      return isDropTuning
                        ? ` \u2014 drop tuning: one finger flat across strings ${strNum}\u2013${strNum - 2} at fret ${g.fret}.`
                        : ` \u2014 root on string ${strNum} fret ${g.fret}, fifth on string ${strNum - 1} fret ${g.fret + 2}.`;
                    })()}
                  </div>
                )}
              </>
            )}

            {panelTab === "amp" && (
              <>
                <div className="fse-section-label">Amp</div>
                <div className="fse-chordgrid" style={{ marginBottom: 14 }}>
                  {Object.entries(AMP_PRESETS).map(([k, v]) => (
                    <button key={k} className={`fse-chord ${ampKey === k ? "active" : ""}`}
                      onClick={() => { setAmpKey(k); setAmpCfg({ ...v }); setDrive(k !== "clean"); playPower(rootPc, 1.6); }}>
                      <span className="fse-chord-name" style={{ fontSize: 13 }}>{v.name}</span>
                      <span className="fse-chord-rn">gain {v.gain}</span>
                    </button>
                  ))}
                </div>

                <div className="fse-amprow">
                  <span className="fse-tag">Cab</span>
                  <select className="fse-select" style={{ padding: "8px 10px", fontSize: 12 }}
                    value={ampCfg.cab} onChange={(e) => setAmpCfg((c) => ({ ...c, cab: e.target.value }))} aria-label="Cabinet">
                    {Object.entries(CABS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
                  </select>
                  <button className="fse-pill" onClick={() => playPower(rootPc, 1.8)}>Test chord</button>
                  <button className="fse-pill" onClick={() => playMidi(tuning.midi[0], 0, 2.2)}>Open low string</button>
                </div>

                {[
                  ["drive", "Drive", 0, 1, 0.01],
                  ["gain", "Gain", 0.5, 14, 0.1],
                  ["bass", "Bass", -12, 12, 0.5],
                  ["mid", "Mid", -12, 12, 0.5],
                  ["treble", "Treble", -12, 12, 0.5],
                  ["presence", "Presence", -8, 10, 0.5],
                ].map(([key, label, min, max, step]) => (
                  <div className="fse-amprow" key={key}>
                    <span className="fse-tag">{label}</span>
                    <input type="range" className="fse-slider" min={min} max={max} step={step}
                      value={ampCfg[key]} aria-label={label}
                      onChange={(e) => setAmpCfg((c) => ({ ...c, [key]: Number(e.target.value) }))} />
                    <span className="fse-ampval">{typeof ampCfg[key] === "number" ? ampCfg[key].toFixed(key === "drive" ? 2 : 1) : ""}</span>
                  </div>
                ))}

                <div className="fse-ivinfo">
                  Notes are a plucked-string physical model, not oscillators &mdash; so palm mutes,
                  pick attack and harmonic decay behave like a real string. That runs into a tube-style
                  drive stage, a tone stack and a synthesised speaker cabinet.
                </div>
              </>
            )}

            {panelTab === "find" && (
              <>
                <div className="fse-section-label">Play or tap the notes you used</div>
                <div className="fse-pills" style={{ marginBottom: 10 }}>
                  {SHARP_NAMES.map((_, pc) => (
                    <button key={pc} className={`fse-pill ${findPcs.includes(pc) ? "active" : ""}`} onClick={() => toggleFindPc(pc)}>
                      {pcName(pc, useFlats)}
                    </button>
                  ))}
                </div>
                <div className="fse-drawer-row" style={{ marginBottom: 10 }}>
                  <button className="fse-pill" onClick={() => setFindPcs([])}>Clear</button>
                  {micOn && micPitch && (
                    <button className="fse-pill" onClick={() => toggleFindPc(micPitch.pc)}>
                      Add heard note ({pcName(micPitch.pc, useFlats)})
                    </button>
                  )}
                  <span className="fse-hint">{findPcs.length ? `${findPcs.length} note${findPcs.length > 1 ? "s" : ""} selected` : "pick at least one note"}</span>
                </div>
                {findPcs.length > 0 && (() => {
                  const matches = findMatches();
                  if (!matches.length) return <div className="fse-ivinfo">No scale in the library contains all of those notes.</div>;
                  return (
                    <>
                      <div className="fse-section-label">Scales that contain them &mdash; fewest extra notes first</div>
                      <div className="fse-chordgrid">
                        {matches.map((m, i) => (
                          <button key={i} className="fse-chord" style={{ minWidth: 128 }}
                            onClick={() => { setRootPc(m.root); setScaleIdx(m.scaleIdx); setChordIdx(null); setProgChord(null); }}>
                            <span className="fse-chord-name" style={{ fontSize: 12 }}>{pcName(m.root, useFlats)} {SCALES[m.scaleIdx].name}</span>
                            <span className="fse-chord-rn">{m.extra === 0 ? "exact fit" : `+${m.extra} other note${m.extra > 1 ? "s" : ""}`}</span>
                          </button>
                        ))}
                      </div>
                      <div className="fse-ivinfo">Tap a match to load it onto the board.</div>
                    </>
                  );
                })()}
              </>
            )}

            {panelTab === "saved" && (
              <>
                <div className="fse-drawer-row" style={{ marginBottom: 12 }}>
                  <input className="fse-select" style={{ flex: "1 1 150px", minWidth: 130, padding: "8px 10px", fontSize: 12 }}
                    value={slotName} onChange={(e) => setSlotName(e.target.value)}
                    placeholder={`${pcName(rootPc, useFlats)} ${scale.name}`} aria-label="Save name" />
                  <button className="fse-play" onClick={saveSlot}>Save setup</button>
                  <button className="fse-pill" onClick={share}>Copy link</button>
                </div>
                {!slotsReady && <div className="fse-hint">Loading&hellip;</div>}
                {slotsReady && !slots.length && (
                  <div className="fse-ivinfo" style={{ marginTop: 0 }}>
                    Nothing saved yet. A save keeps your key, scale, tuning, tempo, meter, riff patterns and drums.
                  </div>
                )}
                <div className="fse-chordgrid">
                  {slots.map((sl) => (
                    <span key={sl.name} className="fse-slot">
                      <button className="fse-slotload" onClick={() => {
                        setShareMsg(applyState(sl.code) ? `Loaded ${sl.name}` : "Couldn't load that");
                        setTimeout(() => setShareMsg(""), 1800);
                      }}>{sl.name}</button>
                      <button className="fse-slotdel" onClick={() => deleteSlot(sl.name)} aria-label={`Delete ${sl.name}`}>&times;</button>
                    </span>
                  ))}
                </div>
              </>
            )}

            {panelTab === "tab" && (
              <>
                <div className="fse-row-controls" style={{ marginBottom: 0 }}>
                  <button className="fse-play" onClick={copyTab}>{tabCopied ? "\u2713 Copied" : "Copy tab"}</button>
                  <span className="fse-hint">Matches the current key, scale, tuning, octaves and direction.</span>
                </div>
                <div className="fse-tabout">{buildTab()}</div>
              </>
            )}

            {panelTab === "prog" && (
              <>
                <div className="fse-section-label">Pick a progression</div>
                <div className="fse-chordgrid">
                  {PROGRESSIONS.map((p, i) => (
                    <button key={p.name} className={`fse-chord ${progIdx === i ? "active" : ""}`} style={{ minWidth: 130 }}
                      onClick={() => { if (progPlaying) stopProg(); setProgIdx(progIdx === i ? null : i); setChordIdx(null); setProgChord(null); setProgStep(-1); }}>
                      <span className="fse-chord-name" style={{ fontSize: 12 }}>{p.name}</span>
                      <span className="fse-chord-rn">{p.note}</span>
                    </button>
                  ))}
                </div>
                {progIdx !== null && (
                  <>
                    <div className="fse-row-controls" style={{ marginTop: 14, marginBottom: 0 }}>
                      <button className="fse-play" onClick={playProg}>{progPlaying ? "\u25A0 Stop" : "\u25B6 Play progression"}</button>
                      <div className="fse-toggle" role="group" aria-label="Beats per chord">
                        {[2, 4, 8].map((b) => (
                          <button key={b} className={beatsPerChord === b ? "on" : ""} onClick={() => setBeatsPerChord(b)}>{b} beats</button>
                        ))}
                      </div>
                      <span className="fse-hint">loops until you stop</span>
                    </div>
                    <div className="fse-proggrid">
                      {PROGRESSIONS[progIdx].degrees.map((deg, i) => {
                        const ch = progChordAt(progIdx, i);
                        if (!ch) return null;
                        return (
                          <button key={i} className={`fse-progchord ${progStep === i ? "now" : ""}`}
                            onClick={() => { playChord(ch.pcs, ch.rootPc); setChordIdx(null); setProgChord(ch); setProgStep(i); }}>
                            <span className="fse-chord-name">{pcName(ch.rootPc, useFlats)}{ch.suffix}</span>
                            <span className="fse-chord-rn">{ch.roman}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="fse-ivinfo">
                      Chord tones light up teal on the neck as it plays &mdash; loop it and solo over the top.
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {mode === "riff" && (
        <div className="fse-panel">
          <div className="fse-panelbody">
            <div className="fse-section-label">Against the {pcName(pedalPc, useFlats)} pedal</div>
            <div className="fse-charlist">
              {Array.from({ length: 12 }, (_, iv) => {
                const inScale = scaleSet.has((pedalPc + iv) % 12);
                return (
                  <span key={iv} className={`fse-char ${iv === 6 ? "tri" : ""} ${inScale ? "inscale" : ""}`}>
                    {pcName((pedalPc + iv) % 12, useFlats)} &middot; {PEDAL_CHARACTER[iv]}
                  </span>
                );
              })}
            </div>
            <div className="fse-ivinfo">
              Outlined chips are in {pcName(rootPc, useFlats)} {scale.name}. Play alternates pedal / note so you hear each interval
              against the open low string &mdash; the b2 and b5 are where most metal riffs live.
            </div>
          </div>
        </div>
      )}

      {mode === "intervals" && refPos && (
        <div className="fse-panel">
          <div className="fse-panelbody">
            <div className="fse-section-label">Intervals from {pcName(refPos.pc, useFlats)}</div>
            <div className="fse-readout-notes">
              {Array.from({ length: 12 }, (_, iv) => (
                <span key={iv} className={`fse-note-chip ${iv === 0 ? "root" : ""}`} title={INTERVAL_FULL[iv]}>
                  {INTERVAL_LABELS[iv]} {pcName((refPos.pc + iv) % 12, useFlats)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
