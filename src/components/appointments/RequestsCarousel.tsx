"use client";

import { useRef } from "react";
import Avatar from "./Avatar";
import { type AppointmentRow, VISIT_LABEL, formatDate, formatTime, fullName } from "./shared";

type Props = {
  requests: AppointmentRow[];
  disabled: boolean;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  canReject?: (request: AppointmentRow) => boolean;
};

export default function RequestsCarousel({ requests, disabled, onAccept, onReject, canReject = () => true }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => track.current?.scrollBy({ left: dir * track.current.clientWidth, behavior: "smooth" });

  if (requests.length === 0) {
    return <p className="requests-empty">No pending requests.</p>;
  }

  return (
    <div className="carousel">
      <button className="carousel-arrow" onClick={() => scroll(-1)} aria-label="Previous">
        <i className="fa-solid fa-chevron-left" />
      </button>

      <div className="carousel-track" ref={track}>
        {requests.map((r) => (
          <article key={r.id} className="request-card">
            <Avatar person={r.patient} online />
            <h4 className="request-name">{fullName(r.patient)}</h4>
            <dl className="request-details">
              <dt>Doctor Name:</dt>
              <dd>{r.doctor ? fullName(r.doctor) : "Unassigned"}</dd>
              <dt>Appointment Date:</dt>
              <dd>{formatDate(r.startsAt)}</dd>
              <dt>Appointment Time:</dt>
              <dd>{formatTime(r.startsAt)}</dd>
              <dt>Visit Type:</dt>
              <dd>{VISIT_LABEL[r.visitType]}</dd>
            </dl>
            <div className="request-actions">
              <button className="btn btn-success" disabled={disabled} onClick={() => onAccept(r.id)}>
                Accept
              </button>
              {canReject(r) && (
                <button className="btn btn-primary" disabled={disabled} onClick={() => onReject(r.id)}>
                  Reject
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      <button className="carousel-arrow" onClick={() => scroll(1)} aria-label="Next">
        <i className="fa-solid fa-chevron-right" />
      </button>
    </div>
  );
}
