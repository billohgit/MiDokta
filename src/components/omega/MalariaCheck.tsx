"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatDistance } from "@/lib/geo";
import { DANGER_SIGNS, FOR_WHOM, type ForWhom, SL_DISTRICTS, SYMPTOMS } from "@/lib/malaria/screening";

/**
 * Omega's malaria check, asked inside the Omega chat: who it's for, eight yes/no symptom questions,
 * the danger signs, and the district. The server scores the answers and, for a suspected case,
 * refers the patient to the nearest hospital or clinic (see src/lib/malaria/cases.ts).
 */

type Place = { name: string; kind: string; distanceKm: number | null; address: string | null; phone: string | null; directionsUrl: string | null; onMiDokta: boolean; emergency?: boolean };
type Result = { outcome: "LOW" | "SUSPECTED" | "DANGER"; score: number; caseId: string | null; existingCase: boolean; advice: string; facilities: Place[]; pharmacies: Place[] };
type LatLng = { lat: number; lng: number };

type Props = {
  /** Reads Omega's questions aloud when voice is on. */
  say: (text: string) => void;
  getPosition: () => Promise<LatLng | null>;
  onClose: () => void;
};

const STEPS = 1 + SYMPTOMS.length + 2;

export default function MalariaCheck({ say, getPosition, onClose }: Props) {
  const [forWhom, setForWhom] = useState<ForWhom | null>(null);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [danger, setDanger] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [district, setDistrict] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const end = useRef<HTMLDivElement>(null);

  const answered = SYMPTOMS.filter((q) => q.id in answers).length;
  const current = !forWhom ? "forWhom" : answered < SYMPTOMS.length ? SYMPTOMS[answered].id : danger === null ? "danger" : district === null ? "district" : "done";
  const child = forWhom === "CHILD";
  // "Do you have a headache?" -> "Does your child have a headache?" ("your" first, so "your child" survives).
  const reword = (t: string) =>
    child ? t.replace(/\byour\b/g, "their").replace(/\bDo you\b/, "Does your child").replace(/\bHave you\b/, "Has your child").replace(/\byou\b/g, "they") : t;

  const question =
    current === "forWhom"
      ? "Let's check for malaria. Who is this check for?"
      : current === "danger"
        ? `Does ${child ? "your child" : "anyone"} have any of these danger signs now? Tap all that apply.`
        : current === "district"
          ? "Last question: which district are you in?"
          : current === "done"
            ? null
            : reword(SYMPTOMS.find((q) => q.id === current)!.text);

  // Keep the newest question (or the result) in view inside Omega's chat.
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [question, status, error, result]);

  useEffect(() => {
    if (question) say(question);
    // Only when the question changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question]);

  useEffect(() => {
    if (current !== "done" || result || status) return;
    (async () => {
      setError(null);
      setStatus("Finding the nearest health centres...");
      const location = await getPosition();
      setStatus("Checking your answers...");
      try {
        const res = await fetch("/api/malaria/screen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers, dangerSigns: danger, forWhom, district: district || null, location }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "The check couldn't be saved. Please try again.");
        setResult(data as Result);
        say((data as Result).advice);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setStatus(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, result]);

  const retry = () => {
    setError(null);
    setResult(null);
    setDistrict(null);
  };

  // The number of the question on screen.
  const step = (forWhom ? 1 : 0) + answered + (danger !== null ? 1 : 0) + 1;

  return (
    <div className="malaria-check" aria-live="polite">
      {/* What was asked and answered so far. */}
      {forWhom && (
        <>
          <div className="omega-msg assistant">Let&apos;s check for malaria. Who is this check for?</div>
          <div className="omega-msg user">{FOR_WHOM.find((f) => f.id === forWhom)?.label}</div>
        </>
      )}
      {SYMPTOMS.filter((q) => q.id in answers).map((q) => (
        <div key={q.id} className="malaria-pair">
          <div className="omega-msg assistant">{reword(q.text)}</div>
          <div className="omega-msg user">{answers[q.id] ? "Yes" : "No"}</div>
        </div>
      ))}
      {danger !== null && (
        <>
          <div className="omega-msg assistant">Any danger signs?</div>
          <div className="omega-msg user">{danger.length ? danger.map((d) => DANGER_SIGNS.find((s) => s.id === d)?.label).join(", ") : "None of these"}</div>
        </>
      )}
      {district !== null && (
        <>
          <div className="omega-msg assistant">Which district are you in?</div>
          <div className="omega-msg user">{district || "Skipped"}</div>
        </>
      )}

      {question && (
        <div className="omega-msg assistant malaria-question">
          <span className="malaria-step">
            Malaria check · {Math.min(step, STEPS)} of {STEPS}
          </span>
          <p>{question}</p>
          {current === "forWhom" && (
            <div className="malaria-options">
              {FOR_WHOM.map((f) => (
                <button key={f.id} type="button" className="omega-chip" onClick={() => setForWhom(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
          )}
          {SYMPTOMS.some((q) => q.id === current) && (
            <div className="malaria-options">
              <button type="button" className="omega-chip" onClick={() => setAnswers((a) => ({ ...a, [current]: true }))}>
                Yes
              </button>
              <button type="button" className="omega-chip" onClick={() => setAnswers((a) => ({ ...a, [current]: false }))}>
                No
              </button>
            </div>
          )}
          {current === "danger" && (
            <>
              <div className="malaria-signs">
                {DANGER_SIGNS.map((d) => (
                  <label key={d.id} className="checkbox-line">
                    <input
                      type="checkbox"
                      checked={picked.includes(d.id)}
                      onChange={(e) => setPicked((p) => (e.target.checked ? [...p, d.id] : p.filter((x) => x !== d.id)))}
                    />
                    <span>{d.label}</span>
                  </label>
                ))}
              </div>
              <div className="malaria-options">
                <button type="button" className="omega-chip" onClick={() => setDanger(picked)}>
                  {picked.length ? "Continue" : "None of these"}
                </button>
              </div>
            </>
          )}
          {current === "district" && (
            <div className="malaria-options">
              <select aria-label="District" defaultValue="" onChange={(e) => e.target.value && setDistrict(e.target.value)}>
                <option value="">Choose your district</option>
                {SL_DISTRICTS.map((d) => (
                  <option key={d}>{d}</option>
                ))}
                <option>Outside Sierra Leone</option>
              </select>
              <button type="button" className="omega-chip" onClick={() => setDistrict("")}>
                Skip
              </button>
            </div>
          )}
        </div>
      )}

      {status && (
        <div className="omega-msg assistant omega-typing">
          <i className="fa-solid fa-circle-notch fa-spin" /> {status}
        </div>
      )}
      {error && (
        <div className="omega-msg assistant error">
          {error}{" "}
          <button type="button" className="omega-chip" onClick={retry}>
            Try again
          </button>
        </div>
      )}

      {result && (
        <div className={`omega-msg assistant malaria-result malaria-${result.outcome.toLowerCase()}`}>
          <strong>
            {result.outcome === "DANGER" ? "Danger signs: go to hospital now" : result.outcome === "SUSPECTED" ? `Malaria suspected (${result.score}%)` : `Malaria unlikely (${result.score}%)`}
          </strong>
          <p>{result.advice}</p>
          {result.existingCase && <p className="omega-note">This has been added to your open malaria case.</p>}
          {result.facilities.length > 0 && (
            <>
              <h4>{result.outcome === "DANGER" ? "Nearest hospitals" : "Where to get tested"}</h4>
              <PlaceList places={result.facilities} />
            </>
          )}
          {result.pharmacies.length > 0 && result.outcome !== "LOW" && (
            <>
              <h4>Pharmacies on MiDokta, for the medicine</h4>
              <PlaceList places={result.pharmacies} />
            </>
          )}
          <div className="malaria-options">
            {result.caseId && (
              <Link href="/patient/malaria" className="btn btn-primary btn-sm" onClick={onClose}>
                Follow my case
              </Link>
            )}
            <button type="button" className="omega-chip" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      )}
      <div ref={end} />
    </div>
  );
}

function PlaceList({ places }: { places: Place[] }) {
  return (
    <ul className="malaria-places">
      {places.map((p) => (
        <li key={`${p.name}-${p.distanceKm}`}>
          <div>
            <strong>{p.name}</strong>
            <small>
              {p.distanceKm != null ? `${formatDistance(p.distanceKm)} away · ` : ""}
              {p.kind}
              {p.onMiDokta && <span className="omega-tag">On miDokta</span>}
              {p.emergency && <span className="omega-tag emergency">Emergency</span>}
            </small>
          </div>
          <div className="omega-hospital-actions">
            {p.phone && (
              <a className="icon-btn" href={`tel:${p.phone.replace(/[^\d+]/g, "")}`} aria-label={`Call ${p.name}`} title="Call">
                <i className="fa-solid fa-phone" />
              </a>
            )}
            {p.directionsUrl && (
              <a className="btn btn-outline btn-sm" href={p.directionsUrl} target="_blank" rel="noopener noreferrer">
                Directions
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
