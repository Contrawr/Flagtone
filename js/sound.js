// Small synthesized sound effects (Web Audio, no files). Silent until the first
// user gesture, and whenever muted.
let ctx = null;
let master = null;
let muted = false;
let lastTick = 0;

function audio() {
  if (muted) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// One enveloped oscillator note. `at` is seconds from now.
function tone(freq, { at = 0, dur = 0.12, type = 'sine', gain = 0.2, slide = 0 } = {}) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + at;
  const osc = ac.createOscillator();
  const env = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(env).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export function setMuted(value) {
  muted = value;
  if (muted && ctx?.state === 'running') ctx.suspend();
}

export const isMuted = () => muted;

export const sounds = {
  tap() { tone(520, { dur: 0.05, type: 'triangle', gain: 0.12 }); },
  // Slider movement: a soft tick whose pitch follows the value (0–1), throttled.
  tick(position) {
    const now = performance.now();
    if (now - lastTick < 45) return;
    lastTick = now;
    tone(300 + position * 700, { dur: 0.03, type: 'sine', gain: 0.05 });
  },
  lock() {
    tone(330, { dur: 0.08, type: 'triangle', gain: 0.18 });
    tone(495, { at: 0.06, dur: 0.1, type: 'triangle', gain: 0.15 });
  },
  // Reveal sound by grade: brighter and longer the closer the match.
  grade(id) {
    const chords = {
      perfect: [523, 659, 784, 1047, 1319],
      great: [523, 659, 784, 1047],
      good: [440, 554, 659],
      close: [392, 440],
      off: [220, 185],
    };
    const notes = chords[id] ?? chords.off;
    const type = id === 'off' || id === 'close' ? 'triangle' : 'sine';
    notes.forEach((f, i) => tone(f, { at: i * 0.07, dur: 0.22 + i * 0.03, type, gain: 0.14 }));
    if (id === 'perfect') tone(2093, { at: 0.4, dur: 0.5, gain: 0.06 });
  },
  heartLost() { tone(300, { dur: 0.35, type: 'sawtooth', gain: 0.08, slide: -180 }); },
  heartWon() { [660, 880, 1320].forEach((f, i) => tone(f, { at: i * 0.06, dur: 0.15, gain: 0.1 })); },
  blink() { tone(880, { dur: 0.04, gain: 0.04 }); },
  finish(good) {
    const notes = good ? [523, 659, 784, 1047, 784, 1047] : [392, 349, 330];
    notes.forEach((f, i) => tone(f, { at: i * 0.11, dur: 0.25, type: good ? 'sine' : 'triangle', gain: 0.13 }));
  },
};
