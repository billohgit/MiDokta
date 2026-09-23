"use client";

type Event = { id: string; title: string; startsAt: string; patient: string };

export default function UpcomingEvents({ events }: { events: Event[] }) {
  return (
    <div className="card events-card">
      <h3 className="events-title">Upcoming events</h3>
      {events.length === 0 ? (
        <p className="events-empty">
          No upcoming
          <br />
          appointments
        </p>
      ) : (
        <div>
          {events.map((e) => (
            <div key={e.id} className="event-item">
              <strong>{e.title}</strong>
              <span>
                {e.patient} ·{" "}
                {new Date(e.startsAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
