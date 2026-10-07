import { STATUS_LABEL, VISIT_LABEL, formatDate, formatTime } from "@/components/appointments/shared";
import CallButton from "@/components/calls/CallButton";
import type { UpcomingAppointment } from "@/lib/patient-portal";
import CancelAppointmentButton from "./CancelAppointmentButton";

/** A patient's upcoming visits, with Call (confirmed video visits) and Cancel. Server component. */
export default function UpcomingList({ appointments, canCall }: { appointments: UpcomingAppointment[]; canCall: boolean }) {
  if (appointments.length === 0) return <div className="empty-banner">No upcoming appointments.</div>;

  return (
    <ul className="my-appts">
      {appointments.map((a) => {
        const iso = a.startsAt.toISOString();
        const doctorName = a.doctor ? `Dr. ${a.doctor.firstName} ${a.doctor.lastName}` : null;
        return (
          <li key={a.id} className="card my-appt">
            <div className="my-appt-date">
              <strong>{a.startsAt.toLocaleDateString("en-US", { day: "numeric" })}</strong>
              <span>{a.startsAt.toLocaleDateString("en-US", { month: "short" })}</span>
            </div>
            <div className="my-appt-text">
              <strong>{a.title}</strong>
              <span>
                <i className="fa-regular fa-clock" /> {formatTime(iso)} ·{" "}
                <i className={`fa-solid ${a.visitType === "VIDEO_CALL" ? "fa-video" : "fa-hospital"}`} />{" "}
                {a.visitType === "VIDEO_CALL" ? VISIT_LABEL.VIDEO_CALL : (a.hospital?.name ?? VISIT_LABEL.IN_PERSON)}
              </span>
              <span>{doctorName ?? "Waiting for a doctor to be assigned"}</span>
            </div>
            <div className="my-appt-actions">
              <span className={`status-pill status-${a.status.toLowerCase()}`}>{STATUS_LABEL[a.status]}</span>
              {canCall && a.doctor && doctorName && a.status === "CONFIRMED" && a.visitType === "VIDEO_CALL" && (
                <CallButton calleeId={a.doctor.id} name={doctorName} basePath="/patient" appointmentId={a.id} label="Call doctor" />
              )}
              {a.startsAt.getTime() > Date.now() && <CancelAppointmentButton id={a.id} when={`${formatDate(iso)} at ${formatTime(iso)}`} />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
