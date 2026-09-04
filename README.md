# Fretboard

A scale explorer, riff constructor, tuner and practice tool for guitar and bass —
built for rock and metal players, not just theory study.

**Live:** https://fretboard.newbold.cloud

## What it does

**Scales** — 19 scales (core, modes, and a metal/exotic set including Phrygian
Dominant, Hungarian minor, double harmonic, both diminished scales and whole tone)
across 19 tunings covering 6-, 7- and 8-string guitar and 4-/5-string bass. CAGED
positions, interval or note labels, the b5 always drawn in red.

**Riff** — A pedal-tone workbench. Hold the low string, build a riff on a step grid
with kick/snare/hat lanes, chain patterns A–D into a song, and export ASCII tab or a
real `.mid` file.

**Tuner** — Real pitch detection through the microphone, for every supported tuning.

**Quiz** — Find named notes on the neck. Answer by tapping *or by playing the note on
your guitar*. Three-level hints and a heat map that drills the notes you keep missing.

**Intervals** — Tap any fret and the whole neck relabels relative to it.

## Things most fretboard apps don't do

- Listens to your actual guitar, in the browser, with no install
- Scores your playing against a looped scale
- Odd-meter accent groupings (`3+2+2`, `3+3+2+3+3+2`) wired into the metronome, the
  riff grid and the drums
- Distortion and palm-mute voicing, so runs sound like a guitar instead of a piano
- Power chords with the actual grip, drop-tuning aware
- Reverse scale finder: play notes, get the scales that contain them
- Diatonic harmony lines a 3rd or 5th above, in key
- Gap trainer that silences whole bars

## Development

```bash
npm install
npm run dev
```

## Stack

Vite + React, Web Audio API for all sound and pitch detection. No backend, no
accounts, no tracking. Saved setups live in your own browser.
