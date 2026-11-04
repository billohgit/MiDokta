import type { CareEvent } from "@prisma/client";
import { formatDate, formatTime } from "@/components/appointments/shared";

type Event = CareEvent & { actor: { firstName: string; lastName: string; role: string } | null };

const ICON: Record<string, string> = {
  STATUS: "fa-circle-check",
  NOTE: "fa-note-sticky",
  CONTACT: "fa-phone",
  SMS: "fa-comment-sms",
  ALERT: "fa-clock",
};

/** The documented history of a test or referral: every step, note, contact and alert. */
export default function Timeline({ events }: { events: Event[] }) {
  if (events.length === 0) return null;
  return (
    <section className="card my-invoice">
      <h3 className="details-subhead">Timeline</h3>
      <ol className="care-timeline">
        {events.map((e) => (
          <li key={e.id} className={`care-event care-${e.kind.toLowerCase()}`}>
            <i className={`fa-solid ${ICON[e.kind] ?? "fa-circle"}`} />
            <div>
              <p>{e.text}</p>
              <span className="section-sub">
                {formatDate(e.createdAt.toISOString())}, {formatTime(e.createdAt.toISOString())}
                {e.actor ? ` · ${e.actor.role === "DOCTOR" ? "Dr. " : ""}${e.actor.firstName} ${e.actor.lastName}` : e.kind === "ALERT" ? " · automatic alert" : ""}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
