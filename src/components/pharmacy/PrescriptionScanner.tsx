"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { scanPrescription, type ScanResult } from "@/app/actions/prescription-scans";
import { addToCart } from "@/app/actions/pharmacy";
import { shrinkUpload } from "@/components/ui/ImageCapture";
import { formatMoney } from "@/lib/money";
import type { Confidence } from "@/lib/prescription-reader";

/** Large enough that handwriting stays readable, small enough to send on mobile data. */
const PHOTO_SIDE = 2400;

const CONFIDENCE: Record<Confidence, { label: string; className: string }> = {
  high: { label: "Clear", className: "status-confirmed" },
  medium: { label: "Check this", className: "status-pending" },
  low: { label: "Unclear", className: "status-rejected" },
};

type Props = {
  /** Patients add matches to their cart; pharmacists see their own stock. */
  mode: "patient" | "pharmacist";
};

/** Photograph a prescription, read it with AI, and find the medicines in the shop. */
export default function PrescriptionScanner({ mode }: Props) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, startReading] = useTransition();
  const [adding, startAdding] = useTransition();
  const [added, setAdded] = useState<Record<string, string>>({});
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!photo) return setPreview(null);
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setResult(null);
    setError(null);
    try {
      setPhoto(await shrinkUpload(file, "prescription.jpg", PHOTO_SIDE));
    } catch {
      setError("That file couldn't be read as a photo. Try a JPG or PNG.");
    }
  };

  const read = () => {
    if (!photo) return;
    const form = new FormData();
    form.set("photo", photo);
    startReading(async () => {
      const r = await scanPrescription(form).catch((): ScanResult => ({ ok: false, error: "Something went wrong. Please try again." }));
      if (r.ok) setResult(r);
      else setError(r.error);
    });
  };

  const add = (productId: string, scanId: string, replaceCart = false) => {
    startAdding(async () => {
      const r = await addToCart(productId, 1, replaceCart, scanId);
      if (r.ok) setAdded((a) => ({ ...a, [productId]: "Added" }));
      else if (r.otherPharmacy && window.confirm(`Your cart has items from ${r.otherPharmacy}. Empty it and add this instead?`)) add(productId, scanId, true);
      else if (!r.otherPharmacy) setError(r.error);
    });
  };

  const reset = () => {
    setPhoto(null);
    setResult(null);
    setError(null);
    setAdded({});
  };

  const done = result?.ok ? result : null;

  return (
    <div className="scanner">
      {!done && (
        <section className="card my-invoice">
          <p className="form-note">
            <i className="fa-solid fa-camera" /> Lay the prescription flat in good light and take a photo of the whole page, so every line is sharp.
          </p>
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Prescription" className="scan-preview" />
          )}
          <div className="row-actions">
            <button type="button" className="btn btn-outline" onClick={() => cameraRef.current?.click()} disabled={reading}>
              <i className="fa-solid fa-camera btn-icon" /> {photo ? "Retake" : "Take photo"}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => fileRef.current?.click()} disabled={reading}>
              <i className="fa-solid fa-image btn-icon" /> Choose photo
            </button>
            {photo && (
              <button type="button" className="btn btn-primary" onClick={read} disabled={reading}>
                {reading ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin btn-icon" /> Reading... (up to a minute)
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-wand-magic-sparkles btn-icon" /> Read prescription
                  </>
                )}
              </button>
            )}
          </div>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => choose(e.target.files?.[0])} />
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => choose(e.target.files?.[0])} />
          {error && <p className="form-error">{error}</p>}
        </section>
      )}

      {done && (
        <>
          <div className="stock-alert">
            <i className="fa-solid fa-triangle-exclamation" /> This is an <strong>AI reading of handwriting</strong> and can be wrong. Check every medicine
            and dose against the prescription{mode === "patient" ? ". The pharmacist will check the photo too before sending your order." : " before dispensing."}
          </div>

          <section className="card my-invoice">
            <header className="my-invoice-head">
              <div>
                <h3 className="details-subhead">Medicines on the prescription</h3>
                <p className="section-sub">
                  {[done.reading.prescriber && `Prescriber: ${done.reading.prescriber}`, done.reading.date && `Date: ${done.reading.date}`].filter(Boolean).join(" · ") ||
                    "Prescriber and date not readable"}
                </p>
              </div>
              {preview && (
                <a href={preview} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Prescription" className="scan-thumb" />
                </a>
              )}
            </header>

            {!done.reading.legible && <p className="pay-status">Most of this prescription couldn&apos;t be read. Try a sharper photo, or ask the pharmacist.</p>}
            {done.reading.warnings.length > 0 && (
              <ul className="scan-warnings">
                {done.reading.warnings.map((w, i) => (
                  <li key={i}>
                    <i className="fa-solid fa-circle-exclamation" /> {w}
                  </li>
                ))}
              </ul>
            )}
            {done.reading.medicines.length === 0 && <p className="empty-banner">No medicines could be read.</p>}

            <ol className="scan-medicines">
              {done.reading.medicines.map((m, i) => (
                <li key={i} className="scan-medicine">
                  <div className="scan-medicine-head">
                    <strong>
                      {m.name}
                      {m.strength && ` ${m.strength}`}
                      {m.form && <span className="section-sub"> · {m.form}</span>}
                    </strong>
                    <span className={`status-pill ${CONFIDENCE[m.confidence].className}`}>{CONFIDENCE[m.confidence].label}</span>
                  </div>
                  <p className="section-sub">
                    {[m.dose, m.frequency, m.duration && `for ${m.duration}`, m.quantity && `quantity ${m.quantity}`].filter(Boolean).join(" · ") || "Dose not readable"}
                  </p>
                  {m.note && <p className="scan-note">{m.note}</p>}

                  {done.matches[i].length === 0 ? (
                    <p className="form-note">{mode === "patient" ? "Not found in any pharmacy's stock." : "You don't stock this."}</p>
                  ) : (
                    <ul className="scan-matches">
                      {done.matches[i].map((p) => (
                        <li key={p.id}>
                          <span>
                            {p.name}
                            {p.detail && <span className="section-sub"> · {p.detail}</span>}
                            {p.strengthMatches && <span className="status-pill status-confirmed">Same strength</span>}
                            <br />
                            <span className="section-sub">
                              {mode === "patient" ? `${p.pharmacyName} · ` : ""}
                              {formatMoney(p.price)} · {p.inStock} in stock
                            </span>
                          </span>
                          {mode === "patient" && (
                            <button className="btn btn-sm btn-primary" disabled={adding || !!added[p.id] || p.inStock === 0} onClick={() => add(p.id, done.scanId)}>
                              {added[p.id] ? (
                                <>
                                  <i className="fa-solid fa-check btn-icon" /> Added
                                </>
                              ) : (
                                <>
                                  <i className="fa-solid fa-cart-plus btn-icon" /> Add
                                </>
                              )}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
            {error && <p className="form-error">{error}</p>}
            <div className="row-actions">
              <button className="btn btn-outline" onClick={reset}>
                Scan another
              </button>
              {mode === "patient" && Object.keys(added).length > 0 && (
                <Link href="/patient/pharmacy/cart" className="btn btn-primary">
                  <i className="fa-solid fa-cart-shopping btn-icon" /> Go to cart
                </Link>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
