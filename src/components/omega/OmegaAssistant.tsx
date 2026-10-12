"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import type { NearbyHospital } from "@/lib/omega/hospitals";
import { canListen, listen, setVoiceEnabled, speak, spokenDose, stopSpeaking, voiceEnabled } from "./speech";

/**
 * Omega, the patient's AI health assistant: a floating button on every patient page that opens a
 * chat the patient can talk to. Omega answers aloud, finds the nearest hospitals with directions,
 * and knows the patient's medicines and appointments (src/lib/omega/agent.ts).
 */

type Entry = { role: "user" | "assistant"; text: string; hospitals?: NearbyHospital[]; error?: boolean };
type LatLng = { lat: number; lng: number };

const SUGGESTIONS = [
  { label: "Nearest hospital", icon: "fa-hospital", text: "Where is the nearest hospital?" },
  { label: "My medicines", icon: "fa-pills", text: "When should I take my medicine today?" },
  { label: "Next appointment", icon: "fa-calendar-check", text: "When is my next appointment?" },
];

function getPosition(): Promise<LatLng | null> {
  if (!("geolocation" in navigator)) return Promise.resolve(null);
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 2 * 60_000 }
    )
  );
}

/** The location, without prompting: only when the patient already allowed it. */
async function knownPosition(): Promise<LatLng | null> {
  try {
    const status = await navigator.permissions?.query({ name: "geolocation" });
    return status?.state === "granted" ? getPosition() : null;
  } catch {
    return null;
  }
}

const localTime = () =>
  new Date().toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

type Reply = { kind: "reply"; text: string; hospitals?: NearbyHospital[] } | { kind: "needs-location" };

async function ask(history: Entry[], location: LatLng | null): Promise<Reply> {
  const res = await fetch("/api/omega", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: history.filter((e) => !e.error).map(({ role, text }) => ({ role, text })),
      location,
      localTime: localTime(),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Omega couldn't answer just now. Please try again.");
  return data as Reply;
}

export default function OmegaAssistant({ firstName }: { firstName: string }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voice, setVoice] = useState(true);
  const [micSupported, setMicSupported] = useState(false);
  const stopListening = useRef<(() => void) | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVoice(voiceEnabled());
    setMicSupported(canListen());
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [entries, busy]);

  useEffect(() => {
    if (!open) {
      stopListening.current?.();
      stopSpeaking();
    }
  }, [open]);

  const send = async (text: string) => {
    text = text.trim();
    if (!text || busy) return;
    const history: Entry[] = [...entries, { role: "user", text }];
    setEntries(history);
    setInput("");
    setBusy(true);
    setStatus("Thinking...");

    const answer = (entry: Entry) => {
      setEntries((prev) => [...prev, entry]);
      if (voice && !entry.error) speak(spokenDose(entry.text));
    };

    try {
      let reply = await ask(history, await knownPosition());
      if (reply.kind === "needs-location") {
        setStatus("Finding your location...");
        const position = await getPosition();
        if (!position) {
          answer({
            role: "assistant",
            text: "I need your location to find hospitals near you. Please allow location access for this site in your browser settings, then ask me again.",
          });
          return;
        }
        setStatus("Searching for hospitals near you...");
        reply = await ask(history, position);
      }
      if (reply.kind === "reply") answer({ role: "assistant", text: reply.text, hospitals: reply.hospitals });
    } catch (e) {
      answer({ role: "assistant", text: e instanceof Error ? e.message : "Something went wrong.", error: true });
    } finally {
      setBusy(false);
      setStatus(null);
    }
  };

  const toggleMic = () => {
    if (listening) {
      stopListening.current?.();
      return;
    }
    setListening(true);
    stopListening.current = listen({
      onText: setInput,
      onDone: (text) => {
        setListening(false);
        stopListening.current = null;
        if (text) send(text);
      },
      onError: (message) => setEntries((prev) => [...prev, { role: "assistant", text: message, error: true }]),
    });
  };

  const toggleVoice = () => {
    setVoiceEnabled(!voice);
    setVoice(!voice);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    send(input);
  };

  return (
    <>
      {open && (
        <section className="omega-panel" aria-label="Omega, your AI health assistant">
          <header className="omega-head">
            <img src="/omega.png" alt="" className="omega-avatar" />
            <div className="omega-title">
              <strong>Omega</strong>
              <small>Your AI health assistant</small>
            </div>
            <button
              className="icon-btn"
              onClick={toggleVoice}
              aria-label={voice ? "Turn voice off" : "Turn voice on"}
              title={voice ? "Voice on" : "Voice off"}
            >
              <i className={`fa-solid ${voice ? "fa-volume-high" : "fa-volume-xmark"}`} />
            </button>
            <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close Omega">
              <i className="fa-solid fa-xmark" />
            </button>
          </header>

          <div className="omega-messages" ref={scroller} aria-live="polite">
            <div className="omega-msg assistant">
              Hi {firstName}! I&apos;m Omega. Ask me about your medicines, your appointments, or where the nearest hospital
              is. {micSupported ? "Tap the microphone to talk to me." : ""}
            </div>
            {entries.map((e, i) => (
              <div key={i} className={`omega-msg ${e.role}${e.error ? " error" : ""}`}>
                {e.text}
                {e.hospitals && e.hospitals.length > 0 && <HospitalResults hospitals={e.hospitals} />}
              </div>
            ))}
            {busy && (
              <div className="omega-msg assistant omega-typing">
                <i className="fa-solid fa-circle-notch fa-spin" /> {status}
              </div>
            )}
            {entries.length === 0 && (
              <div className="omega-suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s.label} className="omega-chip" onClick={() => send(s.text)} disabled={busy}>
                    <i className={`fa-solid ${s.icon}`} /> {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form className="omega-input" onSubmit={submit}>
            {micSupported && (
              <button
                type="button"
                className={`omega-mic${listening ? " listening" : ""}`}
                onClick={toggleMic}
                disabled={busy}
                aria-label={listening ? "Stop listening" : "Talk to Omega"}
              >
                <i className={`fa-solid ${listening ? "fa-stop" : "fa-microphone"}`} />
              </button>
            )}
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={listening ? "Listening..." : "Ask Omega..."}
              aria-label="Message Omega"
              disabled={listening}
            />
            <button type="submit" className="omega-send" disabled={busy || !input.trim()} aria-label="Send">
              <i className="fa-solid fa-paper-plane" />
            </button>
          </form>
          <p className="omega-disclaimer">Omega gives general information, not a diagnosis. In an emergency, call your local emergency number.</p>
        </section>
      )}

      <button className={`omega-fab${open ? " open" : ""}`} onClick={() => setOpen((o) => !o)} aria-label={open ? "Close Omega" : "Ask Omega"}>
        <img src="/omega.png" alt="" />
        {!open && <span>Ask Omega</span>}
      </button>
    </>
  );
}

function HospitalResults({ hospitals }: { hospitals: NearbyHospital[] }) {
  const nearest = hospitals[0];
  const pad = 0.01;
  const bbox = [nearest.lng - pad, nearest.lat - pad, nearest.lng + pad, nearest.lat + pad].join(",");

  return (
    <div className="omega-hospitals">
      <iframe
        className="omega-map"
        title={`Map of ${nearest.name}`}
        src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${nearest.lat},${nearest.lng}`}
        loading="lazy"
      />
      <a className="btn btn-primary omega-navigate" href={nearest.directionsUrl} target="_blank" rel="noopener noreferrer">
        <i className="fa-solid fa-diamond-turn-right btn-icon" /> Start navigation to {nearest.name}
      </a>
      <ul>
        {hospitals.map((h) => (
          <li key={`${h.name}-${h.lat}`}>
            <div className="omega-hospital-info">
              <strong>{h.name}</strong>
              <small>
                {h.distanceKm} km away · {h.kind}
                {h.onMiDokta && <span className="omega-tag">On miDokta</span>}
                {h.emergency && <span className="omega-tag emergency">Emergency</span>}
              </small>
              {h.address && <small>{h.address}</small>}
            </div>
            <div className="omega-hospital-actions">
              {h.phone && (
                <a className="icon-btn" href={`tel:${h.phone.replace(/[^\d+]/g, "")}`} aria-label={`Call ${h.name}`} title="Call">
                  <i className="fa-solid fa-phone" />
                </a>
              )}
              <a className="btn btn-outline btn-sm" href={h.directionsUrl} target="_blank" rel="noopener noreferrer">
                Directions
              </a>
            </div>
          </li>
        ))}
      </ul>
      <small className="omega-note">Distances are in a straight line; the road route may be longer.</small>
    </div>
  );
}
