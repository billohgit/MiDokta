"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatDistance } from "@/lib/geo";
import { DANGER_SIGNS, FOR_WHOM, type ForWhom, SL_DISTRICTS, SYMPTOMS } from "@/lib/malaria/screening";
import { COUNTRIES } from "@/lib/countries";

/**
 * Omega's malaria check, asked inside the Omega chat: who it's for, eight yes/no symptom questions,
 * the danger signs, and where they are: their location (any country: the server works out the
 * district and finds the nearest clinic and pharmacy) or a country and district they choose. The
 * server scores the answers and, for a suspected case, refers the patient (src/lib/malaria/cases.ts).
 */

type Place = { name: string; kind: string; distanceKm: number | null; address: string | null; phone: string | null; directionsUrl: string | null; onMiDokta: boolean; emergency?: boolean };
type Result = { outcome: "LOW" | "SUSPECTED" | "DANGER"; score: number; caseId: string | null; existingCase: boolean; advice: string; facilities: Place[]; pharmacies: Place[] };
type LatLng = { lat: number; lng: number };
type Where = { mode: "location" } | { mode: "chosen"; country: string; district: string } | { mode: "skip" };

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
  const [where, setWhere] = useState<Where | null>(null);
  const [country, setCountry] = useState("SL");
  const [typed, setTyped] = useState("");
  const [noLocation, setNoLocation] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const end = useRef<HTMLDivElement>(null);

  const answered = SYMPTOMS.filter((q) => q.id in answers).length;
  const current = !forWhom ? "forWhom" : answered < SYMPTOMS.length ? SYMPTOMS[answered].id : danger === null ? "danger" : where === null ? "district" : "done";
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
          ? "Last question: where are you? Your location finds the nearest clinic and pharmacy, in any country."
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
      let location: LatLng | null = null;
      if (where?.mode === "location") {
        setStatus("Finding where you are...");
        location = await getPosition();
        if (!location) {
          // Permission refused or no signal: ask for the country and district instead.
          setStatus(null);
          setNoLocation(true);
          setWhere(null);
          return;
        }
      }
      setStatus("Checking your answers and finding the nearest care...");
      try {
        const res = await fetch("/api/malaria/screen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answers,
            dangerSigns: danger,
            forWhom,
            country: where?.mode === "chosen" ? where.country : null,
            district: where?.mode === "chosen" ? where.district : null,
            location,
          }),
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
    setWhere(null);
  };

  const countryName = (iso: string) => COUNTRIES.find((c) => c.iso === iso)?.name ?? iso;
  const answeredWhere = !where ? "" : where.mode === "location" ? "Use my location" : where.mode === "skip" ? "Skipped" : `${where.district}, ${countryName(where.country)}`;

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
      {where !== null && (
        <>
          <div className="omega-msg assistant">Where are you?</div>
          <div className="omega-msg user">{answeredWhere}</div>
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
            <>
              {noLocation ? (
                <p className="omega-note">Your location isn&apos;t available. Choose your country and district instead.</p>
              ) : (
                <div className="malaria-options">
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setWhere({ mode: "location" })}>
                    <i className="fa-solid fa-location-crosshairs btn-icon" /> Use my location
                  </button>
                  <span className="omega-note">or choose:</span>
                </div>
              )}
              <form
                className="malaria-where"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (typed.trim()) setWhere({ mode: "chosen", country, district: typed.trim() });
                }}
              >
                <select aria-label="Country" value={country} onChange={(e) => (setCountry(e.target.value), setTyped(""))}>
                  {COUNTRIES.map((c) => (
                    <option key={c.iso} value={c.iso}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {country === "SL" ? (
                  <select aria-label="District" value={typed} onChange={(e) => setTyped(e.target.value)}>
                    <option value="">Choose your district</option>
                    {SL_DISTRICTS.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                ) : (
                  <input aria-label="District, region or town" placeholder="District, region or town" value={typed} maxLength={80} onChange={(e) => setTyped(e.target.value)} />
                )}
                <div className="malaria-options">
                  <button type="submit" className="omega-chip" disabled={!typed.trim()}>
                    Continue
                  </button>
                  <button type="button" className="omega-chip" onClick={() => setWhere({ mode: "skip" })}>
                    Skip
                  </button>
                </div>
              </form>
            </>
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
              <h4>Nearest pharmacies, for the medicine</h4>
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
