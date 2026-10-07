import type { User } from "@prisma/client";
import Avatar from "@/components/appointments/Avatar";
import CallButton from "@/components/calls/CallButton";
import MessageButton from "./MessageButton";

/** The patient's doctors with Message and Call. Server component. */
export default function DoctorList({ doctors, canCall }: { doctors: User[]; canCall: boolean }) {
  if (doctors.length === 0) {
    return <p className="events-empty">Your doctors appear here after your first appointment.</p>;
  }
  return (
    <ul className="call-contacts">
      {doctors.map((d) => {
        const name = `Dr. ${d.firstName} ${d.lastName}`;
        return (
          <li key={d.id}>
            <Avatar person={d} size={42} />
            <span className="call-contact-name">
              <strong>{name}</strong>
              {d.specialty && <small>{d.specialty}</small>}
            </span>
            <span className="row-actions">
              <MessageButton userId={d.id} basePath="/patient" />
              {canCall && <CallButton calleeId={d.id} name={name} basePath="/patient" label="Call" />}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
