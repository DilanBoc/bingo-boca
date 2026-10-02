'use client';
import { letterFor } from './bingo';

// Voz del navegador, en español.
export function speak(text) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  const v = voices.find((x) => /es[-_](CO|MX|US|419)/i.test(x.lang)) || voices.find((x) => x.lang?.startsWith('es'));
  if (v) u.voice = v;
  u.lang = v?.lang || 'es-ES';
  u.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export const callNumber = (n) => speak(`${letterFor(n)}, ${n}`);

// Traqueteo corto de balotera con Web Audio
export function rattle(ms = 1400) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const end = ctx.currentTime + ms / 1000;
    for (let t = ctx.currentTime; t < end; t += 0.05 + Math.random() * 0.06) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = 900 + Math.random() * 1400;
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.05);
    }
    setTimeout(() => ctx.close(), ms + 300);
  } catch {}
}
