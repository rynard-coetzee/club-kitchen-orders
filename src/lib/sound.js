// src/lib/sound.js
let audioCtx = null;

export function initSound() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
}

export function ding() {
  if (!audioCtx || audioCtx.state !== "running") return;

  const now = audioCtx.currentTime;

  const o1 = audioCtx.createOscillator();
  const g1 = audioCtx.createGain();
  o1.type = "sine";
  o1.frequency.setValueAtTime(880, now);
  g1.gain.setValueAtTime(0.0001, now);
  g1.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
  g1.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  o1.connect(g1).connect(audioCtx.destination);
  o1.start(now);
  o1.stop(now + 0.2);

  const o2 = audioCtx.createOscillator();
  const g2 = audioCtx.createGain();
  o2.type = "sine";
  o2.frequency.setValueAtTime(1320, now + 0.12);
  g2.gain.setValueAtTime(0.0001, now + 0.12);
  g2.gain.exponentialRampToValueAtTime(0.14, now + 0.13);
  g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.30);
  o2.connect(g2).connect(audioCtx.destination);
  o2.start(now + 0.12);
  o2.stop(now + 0.32);
}
