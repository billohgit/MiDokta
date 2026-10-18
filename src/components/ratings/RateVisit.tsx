"use client";

import { useState } from "react";
import { rateVisit } from "@/app/actions/patient-portal";
import useServerAction from "@/components/ui/useServerAction";

const LABELS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

type Props = { appointmentId: string; stars: number | null; comment: string | null };

/** 1–5 star rating of a completed visit, with an optional comment. The patient can change it later. */
export default function RateVisit({ appointmentId, stars: saved, comment: savedComment }: Props) {
  const { busy, error, run } = useServerAction();
  const [stars, setStars] = useState(saved ?? 0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState(savedComment ?? "");
  const [editing, setEditing] = useState(saved === null);
  const [thanks, setThanks] = useState(false);

  const save = () =>
    run(() => rateVisit(appointmentId, stars, comment), {
      onSuccess: () => {
        setEditing(false);
        setThanks(true);
      },
    });

  if (!editing) {
    return (
      <div className="rate-visit rate-visit-done">
        <span className="stars" role="img" aria-label={`You rated ${stars} out of 5 stars`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <i key={n} aria-hidden="true" className={n <= stars ? "fa-solid fa-star" : "fa-regular fa-star"} />
          ))}
        </span>
        <span className="rate-visit-note">{thanks ? "Thanks for your feedback!" : `You rated this visit: ${LABELS[stars]}`}</span>
        <button type="button" className="btn btn-sm btn-outline" onClick={() => setEditing(true)}>
          Change
        </button>
        {comment && <p className="rate-visit-comment">“{comment}”</p>}
      </div>
    );
  }

  const shown = hover || stars;
  return (
    <div className="rate-visit">
      <div className="star-picker" role="radiogroup" aria-label="Your rating" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}: ${LABELS[n]}`}
            className={n <= shown ? "on" : undefined}
            onMouseEnter={() => setHover(n)}
            onClick={() => setStars(n)}
          >
            <i className={n <= shown ? "fa-solid fa-star" : "fa-regular fa-star"} aria-hidden="true" />
          </button>
        ))}
        <span className="star-picker-label">{shown ? LABELS[shown] : "Tap a star"}</span>
      </div>
      <textarea
        className="rate-visit-text"
        rows={2}
        maxLength={500}
        placeholder="Tell us about the consultation and how the doctor treated you (optional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <div className="rate-visit-actions">
        <button type="button" className="btn btn-sm btn-primary" disabled={busy || stars === 0} onClick={save}>
          {busy ? "Saving..." : "Submit rating"}
        </button>
        {saved !== null && (
          <button
            type="button"
            className="btn btn-sm btn-outline"
            disabled={busy}
            onClick={() => {
              setStars(saved);
              setComment(savedComment ?? "");
              setEditing(false);
            }}
          >
            Cancel
          </button>
        )}
        {error && <small className="form-error">{error}</small>}
      </div>
    </div>
  );
}
