"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { tipOfTheWeek } from "@/lib/malaria/screening";
import { OMEGA_LANGUAGES, type OmegaHospital, type OmegaLanguage, type OmegaReply, isOmegaLanguage } from "@/lib/omega/types";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { canListen, listen, setVoiceEnabled, speak, spokenDose, stopSpeaking, voiceEnabled } from "./speech";
import MalariaCheck from "./MalariaCheck";
import ProposalCard from "./ProposalCard";
import { MALARIA_CHECK_EVENT } from "./events";
import { OMEGA_TEXT, type OmegaText } from "./ui-text";

/**
 * Omega, the patient's AI health assistant: a floating button on every patient page that opens a
 * chat the patient can type or talk to, in English, Krio or French. Omega answers aloud, finds the
 * nearest hospitals with directions, knows the patient's medicines, appointments, tests and
 * referrals, and offers to book, cancel, reorder medicine or message a doctor, each with a Confirm
 * button (src/lib/omega/agent.ts). Without the AI it still answers simple requests (basic mode).
 */

type Reply = Extract<OmegaReply, { kind: "reply" }>;
type Entry = { role: "user" | "assistant"; text: string; error?: boolean } & Partial<Pick<Reply, "hospitals" | "proposals" | "links" | "basic">>;
type LatLng = { lat: number; lng: number };

function getPosition(): Promise<LatLng | null> {
  if (!("geolocation" in navigator)) return Promise.resolve(null);
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 2 * 60_000 },
    ),
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
const today = () => new Date().toLocaleDateString("en-CA");

async function ask(history: Entry[], location: LatLng | null, language: OmegaLanguage): Promise<OmegaReply> {
  const res = await fetch("/api/omega", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: history.filter((e) => !e.error).map(({ role, text }) => ({ role, text })),
      location,
      localTime: localTime(),
      today: today(),
      language,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Omega couldn't answer just now. Please try again.");
  return data as OmegaReply;
}

const LANGUAGE_KEY = "omega:language";

export default function OmegaAssistant({ firstName }: { firstName: string }) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voice, setVoice] = useState(true);
  const [micSupported, setMicSupported] = useState(false);
  const [language, setLanguage] = useState<OmegaLanguage>(locale === "fr" ? "fr" : "en");
  const stopListening = useRef<(() => void) | null>(null);
  /** The malaria check on screen (its key, so starting again restarts it). */
  const [check, setCheck] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const t: OmegaText = OMEGA_TEXT[language];
  const speech = OMEGA_LANGUAGES.find((l) => l.id === language)!.speech;
  const say = (text: string) => voice && speak(spokenDose(text), speech);

  const startCheck = () => {
    setOpen(true);
    setCheck(Date.now());
  };

  useEffect(() => {
    setVoice(voiceEnabled());
    setMicSupported(canListen());
    try {
      const saved = localStorage.getItem(LANGUAGE_KEY);
      if (isOmegaLanguage(saved)) setLanguage(saved);
    } catch {
      // Private window: the default language applies.
    }
  }, []);

  useEffect(() => {
    window.addEventListener(MALARIA_CHECK_EVENT, startCheck);
    return () => window.removeEventListener(MALARIA_CHECK_EVENT, startCheck);
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [entries, busy, check]);

  useEffect(() => {
    if (!open) {
      stopListening.current?.();
      stopSpeaking();
    }
  }, [open]);

  const chooseLanguage = (l: OmegaLanguage) => {
    setLanguage(l);
    stopSpeaking();
    try {
      localStorage.setItem(LANGUAGE_KEY, l);
    } catch {
      // Not remembered in private windows.
    }
  };

  const send = async (text: string) => {
    text = text.trim();
    if (!text || busy) return;
    const history: Entry[] = [...entries, { role: "user", text }];
    setEntries(history);
    setInput("");
    setBusy(true);
    setStatus(t.thinking);

    const answer = (entry: Entry) => {
      setEntries((prev) => [...prev, entry]);
      if (!entry.error) say(entry.text);
    };

    try {
      let reply = await ask(history, await knownPosition(), language);
      if (reply.kind === "needs-location") {
        setStatus(t.locating);
        const position = await getPosition();
        if (!position) return answer({ role: "assistant", text: t.needLocation });
        setStatus(t.searching);
        reply = await ask(history, position, language);
      }
      if (reply.kind === "reply") {
        answer({ role: "assistant", text: reply.text, hospitals: reply.hospitals, proposals: reply.proposals, links: reply.links, basic: reply.basic });
        if (reply.action === "malaria-check") setCheck(Date.now());
      }
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
    stopListening.current = listen(
      {
        onText: setInput,
        onDone: (text) => {
          setListening(false);
          stopListening.current = null;
          if (text) send(text);
        },
        onError: (message) => setEntries((prev) => [...prev, { role: "assistant", text: message, error: true }]),
      },
      speech,
    );
  };

  const malariaTip = () => {
    const tip = t.tip(tipOfTheWeek().text);
    setEntries((prev) => [...prev, { role: "assistant", text: tip }]);
    say(tip);
  };

  const toggleVoice = () => {
    setVoiceEnabled(!voice);
    setVoice(!voice);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    send(input);
  };

  const chips = [t.chips.hospital, t.chips.medicines, t.chips.appointment, t.chips.results, t.chips.book, t.chips.reorder];
  const icons = ["fa-hospital", "fa-pills", "fa-calendar-check", "fa-vial", "fa-calendar-plus", "fa-prescription-bottle-medical"];

  return (
    <>
      {open && (
        <section className="omega-panel" aria-label="Omega" lang={language === "kri" ? "kri" : language}>
          <header className="omega-head">
            <img src="/omega.png" alt="" className="omega-avatar" />
            <div className="omega-title">
              <strong>Omega</strong>
              <small>{t.subtitle}</small>
            </div>
            <select className="omega-lang" value={language} onChange={(e) => chooseLanguage(e.target.value as OmegaLanguage)} aria-label={t.language} title={t.language}>
              {OMEGA_LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
            <button className="icon-btn" onClick={toggleVoice} aria-label={voice ? "Turn voice off" : "Turn voice on"} title={voice ? "Voice on" : "Voice off"}>
              <i className={`fa-solid ${voice ? "fa-volume-high" : "fa-volume-xmark"}`} />
            </button>
            <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close Omega">
              <i className="fa-solid fa-xmark" />
            </button>
          </header>

          <div className="omega-messages" ref={scroller} aria-live="polite">
            <div className="omega-msg assistant">{t.greeting(firstName, micSupported)}</div>
            {entries.map((e, i) => (
              <div key={i} className={`omega-msg ${e.role}${e.error ? " error" : ""}`}>
                {e.basic && <span className="omega-basic">{t.basic}</span>}
                {e.text}
                {e.hospitals && e.hospitals.length > 0 && <HospitalResults hospitals={e.hospitals} t={t} />}
                {e.proposals?.map((p, j) => <ProposalCard key={j} p={p} t={t} />)}
                {e.links && e.links.length > 0 && (
                  <div className="omega-links">
                    {e.links.map((l) => (
                      <Link key={l.href} href={l.href} className="btn btn-outline btn-sm" onClick={() => setOpen(false)}>
                        {l.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {check && <MalariaCheck key={check} say={(text) => voice && speak(text)} getPosition={getPosition} onClose={() => setCheck(null)} />}
            {busy && (
              <div className="omega-msg assistant omega-typing">
                <i className="fa-solid fa-circle-notch fa-spin" /> {status}
              </div>
            )}
            {entries.length === 0 && !check && (
              <div className="omega-suggestions">
                <button className="omega-chip" onClick={startCheck} disabled={busy}>
                  <i className="fa-solid fa-mosquito" /> {t.chips.malaria}
                </button>
                <button className="omega-chip" onClick={malariaTip} disabled={busy}>
                  <i className="fa-solid fa-shield-virus" /> {t.chips.tip}
                </button>
                {chips.map(([label, question], i) => (
                  <button key={label} className="omega-chip" onClick={() => send(question)} disabled={busy}>
                    <i className={`fa-solid ${icons[i]}`} /> {label}
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
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={listening ? t.listening : t.placeholder} aria-label="Message Omega" disabled={listening} />
            <button type="submit" className="omega-send" disabled={busy || !input.trim()} aria-label="Send">
              <i className="fa-solid fa-paper-plane" />
            </button>
          </form>
          <p className="omega-disclaimer">{t.disclaimer}</p>
        </section>
      )}

      <button className={`omega-fab${open ? " open" : ""}`} onClick={() => setOpen((o) => !o)} aria-label={open ? "Close Omega" : "Ask Omega"}>
        <img src="/omega.png" alt="" />
        {!open && <span>Ask Omega</span>}
      </button>
    </>
  );
}

function HospitalResults({ hospitals, t }: { hospitals: OmegaHospital[]; t: OmegaText }) {
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
        <i className="fa-solid fa-diamond-turn-right btn-icon" /> {t.navigate(nearest.name)}
      </a>
      <ul>
        {hospitals.map((h) => (
          <li key={`${h.name}-${h.lat}`}>
            <div className="omega-hospital-info">
              <strong>{h.name}</strong>
              <small>
                {h.distanceKm} {t.km} · {h.kind}
                {h.onMiDokta && <span className="omega-tag">{t.onMiDokta}</span>}
                {h.emergency && <span className="omega-tag emergency">{t.emergency}</span>}
              </small>
              {h.address && <small>{h.address}</small>}
            </div>
            <div className="omega-hospital-actions">
              {h.phone && (
                <a className="icon-btn" href={`tel:${h.phone.replace(/[^\d+]/g, "")}`} aria-label={`${t.call} ${h.name}`} title={t.call}>
                  <i className="fa-solid fa-phone" />
                </a>
              )}
              <a className="btn btn-outline btn-sm" href={h.directionsUrl} target="_blank" rel="noopener noreferrer">
                {t.directions}
              </a>
            </div>
          </li>
        ))}
      </ul>
      <small className="omega-note">{t.straightLine}</small>
    </div>
  );
}
