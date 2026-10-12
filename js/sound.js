// Synthesized sound effects and phone vibrations (Web Audio, no files). Silent
// until the first user gesture, and whenever muted; muting also stops vibration.
let ctx = null;
let out = null;
let muted = false;
let lastTick = 0;
let lastBuzz = 0;

function audio() {
  if (muted) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      // Dry signal plus a soft echo, through a gentle compressor.
      const comp = ctx.createDynamicsCompressor();
      comp.connect(ctx.destination);
      out = ctx.createGain();
      out.gain.value = 0.55;
      out.connect(comp);
      const delay = ctx.createDelay();
      delay.delayTime.value = 0.14;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.28;
      const wet = ctx.createGain();
      wet.gain.value = 0.22;
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 2400;
      out.connect(delay);
      delay.connect(tone).connect(feedback).connect(delay);
      tone.connect(wet).connect(comp);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// One note: two slightly detuned oscillators under an envelope. `at` is seconds from now.
function note(freq, { at = 0, dur = 0.14, type = 'sine', gain = 0.16, slide = 0, attack = 0.008 } = {}) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + at;
  const env = ac.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  env.connect(out);
  for (const detune of [-4, 4]) {
    const osc = ac.createOscillator();
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    osc.connect(env);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }
}

const arpeggio = (freqs, { step = 0.07, at = 0, ...opts } = {}) =>
  freqs.forEach((f, i) => note(f, { ...opts, at: at + i * step }));

// Vibration (Android and other browsers that support it).
function buzz(pattern, minGap = 0) {
  if (muted) return;
  const now = performance.now();
  if (now - lastBuzz < minGap) return;
  lastBuzz = now;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported.
  }
}

export function setMuted(value) {
  muted = value;
  if (muted && ctx?.state === 'running') ctx.suspend();
}

export const isMuted = () => muted;

export const sounds = {
  tap() { note(560, { dur: 0.05, type: 'triangle', gain: 0.09 }); buzz(6); },
  // Slider movement: a soft tick whose pitch follows the value (0–1), throttled.
  tick(position) {
    const now = performance.now();
    if (now - lastTick < 45) return;
    lastTick = now;
    note(300 + position * 700, { dur: 0.03, gain: 0.04 });
    buzz(3, 70);
  },
  tab() { note(700, { dur: 0.06, type: 'triangle', gain: 0.08 }); buzz(8); },
  blink() { note(880, { dur: 0.04, gain: 0.03 }); },
  lock() {
    note(330, { dur: 0.08, type: 'triangle', gain: 0.16 });
    note(495, { at: 0.06, dur: 0.12, type: 'triangle', gain: 0.14 });
    buzz(15);
  },
  // Reveal by grade: brighter and longer the closer the match.
  grade(id) {
    const chords = {
      perfect: [523, 659, 784, 1047, 1319],
      great: [523, 659, 784, 1047],
      good: [440, 554, 659],
      close: [392, 440],
      off: [220, 185],
    };
    const dark = id === 'off' || id === 'close';
    (chords[id] ?? chords.off).forEach((f, i) =>
      note(f, { at: i * 0.07, dur: 0.24 + i * 0.04, type: dark ? 'triangle' : 'sine', gain: 0.13 }));
    if (id === 'perfect') {
      arpeggio([2093, 2637, 3136], { step: 0.05, at: 0.42, dur: 0.4, gain: 0.04 });
      buzz([20, 40, 20, 40, 60]);
    } else if (id === 'great') buzz([20, 40, 40]);
    else if (id === 'off') buzz(80);
  },
  // Combo step n: each one a little higher.
  combo(n) {
    const base = 523 * 2 ** (Math.min(n, 8) / 12);
    arpeggio([base, base * 1.25, base * 1.5], { step: 0.045, dur: 0.12, gain: 0.07, at: 0.55 });
  },
  heartLost() { note(300, { dur: 0.35, type: 'sawtooth', gain: 0.06, slide: -180 }); buzz([60, 40, 60]); },
  heartWon() { arpeggio([660, 880, 1320], { step: 0.06, dur: 0.15, gain: 0.09 }); },
  timeBonus() { arpeggio([988, 1319], { step: 0.05, dur: 0.1, gain: 0.07 }); },
  // Last ten seconds of Time Attack.
  clock(urgent) { note(urgent ? 1200 : 900, { dur: 0.04, type: 'square', gain: urgent ? 0.05 : 0.03 }); if (urgent) buzz(10); },
  timeUp() { note(440, { dur: 0.5, type: 'sawtooth', gain: 0.08, slide: -260 }); buzz([100, 50, 100]); },
  badge() {
    arpeggio([784, 988, 1175, 1568], { step: 0.08, dur: 0.3, gain: 0.1 });
    note(2349, { at: 0.36, dur: 0.6, gain: 0.04 });
    buzz([15, 30, 15, 30, 15]);
  },
  collect() { note(1568, { dur: 0.12, gain: 0.05, at: 0.3 }); },
  finish(good) {
    if (good) arpeggio([523, 659, 784, 1047, 784, 1047], { step: 0.11, dur: 0.28, gain: 0.12 });
    else arpeggio([392, 349, 330], { step: 0.14, dur: 0.3, type: 'triangle', gain: 0.11 });
  },
  duel(result) {
    if (result === 'win') arpeggio([523, 659, 784, 1047, 1319, 1568], { step: 0.09, dur: 0.3, gain: 0.12 });
    else if (result === 'draw') arpeggio([523, 659, 523], { step: 0.12, dur: 0.25, gain: 0.1 });
    else arpeggio([440, 415, 392, 370], { step: 0.14, dur: 0.3, type: 'triangle', gain: 0.1 });
  },
};
