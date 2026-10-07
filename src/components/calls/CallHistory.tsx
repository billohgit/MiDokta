import Link from "next/link";
import { Role, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { callName, expireStaleCalls, videoConfigured } from "@/lib/calls";
import { toParty } from "@/lib/call-state";
import Avatar from "@/components/appointments/Avatar";
import { formatDate, formatTime } from "@/components/appointments/shared";
import CallButton from "./CallButton";

const duration = (from: Date, to: Date) => {
  const minutes = Math.max(1, Math.round((to.getTime() - from.getTime()) / 60000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};

/**
 * Recent calls, and who the user can call: a doctor's patients or a patient's doctors (anyone they
 * have an appointment with). Server component shared by the doctor and patient portals.
 */
export default async function CallHistory({ user, basePath }: { user: User; basePath: string }) {
  await expireStaleCalls(user.id);
  const isDoctor = user.role === Role.DOCTOR;

  const [calls, contacts] = await Promise.all([
    prisma.call.findMany({
      where: { OR: [{ callerId: user.id }, { calleeId: user.id }] },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { caller: true, callee: true },
    }),
    prisma.user.findMany({
      where: isDoctor
        ? { role: Role.PATIENT, isActive: true, patientAppointments: { some: { doctorId: user.id } } }
        : { role: Role.DOCTOR, isActive: true, doctorAppointments: { some: { patientId: user.id } } },
      orderBy: { firstName: "asc" },
      take: isDoctor ? 200 : 50,
    }),
  ]);

  return (
    <div className="settings">
      <div className="appt-header">
        <div>
          <h2 className="section-heading">Video Calls</h2>
          <p className="section-sub">
            {isDoctor ? "Call a patient and their phone rings in the app." : "Call your doctor, or answer when they call you."}
          </p>
        </div>
      </div>

      {!videoConfigured() && (
        <div className="empty-banner">
          {isDoctor ? "Video calls aren't set up yet. Add DAILY_API_KEY to the server settings." : "Video calls aren't available right now."}
        </div>
      )}

      <section className="card calls-card">
        <h3 className="calls-title">{isDoctor ? "Your patients" : "Your doctors"}</h3>
        {contacts.length === 0 ? (
          <p className="events-empty">
            {isDoctor ? "Patients appear here once they have an appointment with you." : "Doctors appear here once you have an appointment with them."}
          </p>
        ) : (
          <ul className="call-contacts">
            {contacts.map((c) => (
              <li key={c.id}>
                <Avatar person={c} size={42} />
                <span className="call-contact-name">
                  <strong>{callName(c)}</strong>
                  {c.specialty && <small>{c.specialty}</small>}
                </span>
                {videoConfigured() && <CallButton calleeId={c.id} name={callName(c)} basePath={basePath} label="Call" />}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card calls-card">
        <h3 className="calls-title">Recent calls</h3>
        {calls.length === 0 ? (
          <p className="events-empty">No calls yet.</p>
        ) : (
          <ul className="call-log">
            {calls.map((call) => {
              const outgoing = call.callerId === user.id;
              const other = toParty(outgoing ? call.callee : call.caller);
              const missed = !outgoing && (call.status === "MISSED" || call.status === "CANCELLED");
              const label =
                call.status === "RINGING" ? "Ringing" :
                call.status === "ACCEPTED" ? "In progress" :
                call.answeredAt ? duration(call.answeredAt, call.endedAt ?? call.answeredAt) :
                missed ? "Missed" :
                call.status === "DECLINED" ? "Declined" :
                outgoing ? "No answer" : "Missed";
              return (
                <li key={call.id} className={missed ? "missed" : undefined}>
                  <i
                    className={`fa-solid ${missed ? "fa-phone-slash" : outgoing ? "fa-arrow-up-right" : "fa-arrow-down-left"} call-dir`}
                    title={outgoing ? "Outgoing" : "Incoming"}
                  />
                  <span className="call-contact-name">
                    <strong>{other.name}</strong>
                    <small>
                      {outgoing ? "Outgoing" : "Incoming"} · {formatDate(call.createdAt.toISOString())} {formatTime(call.createdAt.toISOString())} · {label}
                    </small>
                  </span>
                  {call.status === "RINGING" || call.status === "ACCEPTED" ? (
                    <Link href={`${basePath}/calls/${call.id}`} className="btn btn-sm btn-success">
                      Open
                    </Link>
                  ) : (
                    videoConfigured() && <CallButton calleeId={other.id} name={other.name} basePath={basePath} label="Call back" />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
