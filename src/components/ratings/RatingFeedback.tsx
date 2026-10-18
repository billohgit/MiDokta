import { type Person, formatDate, fullName } from "@/components/appointments/shared";
import Stars from "./Stars";

type Rating = {
  id: string;
  stars: number;
  comment: string | null;
  updatedAt: Date;
  /** Left out for doctors, who see feedback without names. */
  patient?: Person;
};

/** A list of patient ratings, newest first. Server component. */
export default function RatingFeedback({ ratings, empty }: { ratings: Rating[]; empty: string }) {
  if (ratings.length === 0) return <div className="empty-banner">{empty}</div>;
  return (
    <ul className="card rating-feedback">
      {ratings.map((r) => (
        <li key={r.id}>
          <div className="rating-feedback-head">
            <Stars value={r.stars} size="sm" />
            <small>
              {r.patient ? `${fullName(r.patient)} · ` : ""}
              {formatDate(r.updatedAt.toISOString())}
            </small>
          </div>
          {r.comment ? <p>{r.comment}</p> : <p className="rating-feedback-none">No comment</p>}
        </li>
      ))}
    </ul>
  );
}
