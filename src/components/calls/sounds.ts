"use client";

/**
 * Ringing sounds, synthesised with Web Audio so there are no sound files to ship. Browsers keep audio
 * muted until the person has tapped the page once; `unlockAudio` is called on the first tap.
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  return ctx;
}

export function unlockAudio() {
  const c = audio();
  if (c?.state === "suspended") c.resume().catch(() => {});
}

/** One burst of a dual-frequency tone, faded in and out to avoid clicks. */
function tone(c: AudioContext, freqs: number[], start: number, duration: number, volume: number) {
  const gain = c.createGain();
  gain.connect(c.destination);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.02);
  gain.gain.setValueAtTime(volume, start + duration - 0.03);
  gain.gain.linearRampToValueAtTime(0, start + duration);
  for (const f of freqs) {
    const osc = c.createOscillator();
    osc.frequency.value = f;
    osc.connect(gain);
    osc.start(start);
    osc.stop(start + duration);
  }
}

/** Repeats `play` every `everyMs` until the returned stop function is called. */
function loop(play: (c: AudioContext, t: number) => void, everyMs: number, vibrate?: number[]) {
  const c = audio();
  const tick = () => {
    if (c) play(c, c.currentTime);
    if (vibrate && "vibrate" in navigator) navigator.vibrate(vibrate);
  };
  c?.resume().catch(() => {});
  tick();
  const timer = setInterval(tick, everyMs);
  return () => {
    clearInterval(timer);
    if (vibrate && "vibrate" in navigator) navigator.vibrate(0);
  };
}

/** The phone ringing for an incoming call. */
export const playRingtone = () =>
  loop(
    (c, t) => {
      tone(c, [440, 480], t, 0.4, 0.18);
      tone(c, [440, 480], t + 0.6, 0.4, 0.18);
    },
    3000,
    [400, 200, 400]
  );

/** What the caller hears while the other phone rings. */
export const playRingback = () => loop((c, t) => tone(c, [440, 480], t, 1.2, 0.05), 4000);
