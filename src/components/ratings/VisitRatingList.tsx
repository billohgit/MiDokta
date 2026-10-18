import { formatDate } from "@/components/appointments/shared";
import RateVisit from "./RateVisit";

type Visit = {
  id: string;
  title: string;
  startsAt: Date;
  doctor: { firstName: string; lastName: string } | null;
  rating: { stars: number; comment: string | null } | null;
};

/** Completed visits, each with its star rating. Server component. */
export default function VisitRatingList({ visits }: { visits: Visit[] }) {
  return (
    <ul className="visit-ratings">
      {visits.map((v) => (
        <li key={v.id} className="card visit-rating">
          <div className="visit-rating-head">
            <strong>{v.doctor ? `Dr. ${v.doctor.firstName} ${v.doctor.lastName}` : "Your doctor"}</strong>
            <small>
              {formatDate(v.startsAt.toISOString())} · {v.title}
            </small>
          </div>
          <RateVisit appointmentId={v.id} stars={v.rating?.stars ?? null} comment={v.rating?.comment ?? null} />
        </li>
      ))}
    </ul>
  );
}
