"use client";

/**
 * Voice in and out with the browser's built-in Web Speech API: nothing to install or pay for.
 * Listening works in Chrome, Edge and Safari (not Firefox); speaking works everywhere.
 */

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const canListen = () => recognitionCtor() !== null;
export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

const lang = () => (navigator.language?.startsWith("en") ? navigator.language : "en-US");

/**
 * Listens for one spoken message. `onText` gets the words so far while the person talks;
 * `onDone` gets the final text (empty if nothing was heard). Returns a function that stops listening.
 */
export function listen(handlers: { onText: (text: string) => void; onDone: (text: string) => void; onError: (message: string) => void }) {
  const Ctor = recognitionCtor();
  if (!Ctor) {
    handlers.onError("Voice input isn't supported in this browser. Try Chrome, or type your question.");
    return () => {};
  }
  stopSpeaking();
  const rec = new Ctor();
  rec.lang = lang();
  rec.interimResults = true;
  rec.continuous = false;
  let text = "";
  rec.onresult = (e) => {
    text = Array.from(e.results, (r) => r[0].transcript).join(" ").trim();
    handlers.onText(text);
  };
  rec.onerror = (e) => {
    if (e.error === "no-speech" || e.error === "aborted") return;
    handlers.onError(
      e.error === "not-allowed" || e.error === "service-not-allowed"
        ? "Allow microphone access to talk to Omega."
        : "I couldn't hear you. Please try again."
    );
  };
  rec.onend = () => handlers.onDone(text);
  rec.start();
  return () => rec.stop();
}

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
  return voices.find((v) => v.lang === navigator.language) ?? voices.find((v) => /female|samantha|zira|google/i.test(v.name)) ?? voices[0];
}

/** Reads text aloud, replacing anything already being said. Resolves when done (or if speech is blocked). */
export function speak(text: string): Promise<void> {
  if (!canSpeak() || !text.trim()) return Promise.resolve();
  const synth = window.speechSynthesis;
  synth.cancel();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.voice = pickVoice() ?? null;
    u.lang = u.voice?.lang ?? lang();
    u.rate = 0.95;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    synth.speak(u);
  });
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}

/** Spoken units read badly ("500 m g"), so say them in full. */
export const spokenDose = (text: string) =>
  text
    .replace(/(\d)\s*mg\b/gi, "$1 milligrams")
    .replace(/(\d)\s*mcg\b/gi, "$1 micrograms")
    .replace(/(\d)\s*ml\b/gi, "$1 millilitres")
    .replace(/(\d)\s*g\b/gi, "$1 grams");

// Whether Omega speaks (replies and medication reminders). On unless the patient turns it off.
const VOICE_KEY = "omega:voice";

export function voiceEnabled() {
  try {
    return localStorage.getItem(VOICE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setVoiceEnabled(on: boolean) {
  try {
    localStorage.setItem(VOICE_KEY, on ? "on" : "off");
  } catch {
    // Not remembered in private windows; still applies for this page.
  }
  if (!on) stopSpeaking();
}
