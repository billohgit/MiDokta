import Link from "next/link";
import { notFound } from "next/navigation";
import { Role, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { referralDelay, referralTarget } from "@/lib/followups";
import { formatDate, formatTime } from "@/components/appointments/shared";
import Timeline from "./Timeline";
import ReferralActions from "./ReferralActions";
import { REFERRAL_STATUS_CLASS, REFERRAL_STATUS_LABEL, URGENCY_CLASS, URGENCY_LABEL } from "./shared";

const at = (d: Date) => `${formatDate(d.toISOString())}, ${formatTime(d.toISOString())}`;
/** For a datetime-local input. */
const local = (d: Date | null) => (d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

/** One referral: where it stands, the navigator's work with the patient, and the loop's closure. */
export default async function ReferralDetail({ id, user, basePath }: { id: string; user: User; basePath: string }) {
  const r = await prisma.referral.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
      referredBy: { select: { firstName: true, lastName: true } },
      toDoctor: { select: { firstName: true, lastName: true, specialty: true } },
      navigator: { select: { id: true, firstName: true, lastName: true } },
      closedBy: { select: { firstName: true, lastName: true } },
      events: { orderBy: { createdAt: "asc" }, include: { actor: { select: { firstName: true, lastName: true, role: true } } } },
    },
  });
  // Doctors follow the referrals they made or received.
  if (!r || (user.role === Role.DOCTOR && r.referredById !== user.id && r.toDoctorId !== user.id)) notFound();
  const navigators = await prisma.user.findMany({
    where: { role: { in: [Role.NURSE, Role.RECEPTIONIST, Role.ADMIN] }, isActive: true },
    orderBy: { firstName: "asc" },
    select: { id: true, firstName: true, lastName: true, role: true },
  });
  const delay = referralDelay(r);
  const referrer = user.id === r.referredById || user.role === Role.ADMIN;

  return (
    <div className="settings">
      <Link href={`${basePath}/follow-ups?tab=referrals`} className="back-link">
        <i className="fa-solid fa-arrow-left" /> Follow-ups
      </Link>

      <section className="card my-invoice">
        <header className="my-invoice-head">
          <div>
            <h2 className="section-heading">
              Referral #{r.number}: {r.specialty}
            </h2>
            <p className="section-sub">
              <Link href={`${basePath}/patients/${r.patient.id}`} className="table-link">
                {r.patient.firstName} {r.patient.lastName}
              </Link>
              {r.patient.phone && ` · ${r.patient.phone}`} · to {referralTarget(r)} · by Dr. {r.referredBy.firstName} {r.referredBy.lastName} on{" "}
              {formatDate(r.createdAt.toISOString())}
            </p>
          </div>
          <span className={`status-pill ${REFERRAL_STATUS_CLASS[r.status]}`}>{REFERRAL_STATUS_LABEL[r.status]}</span>
        </header>
        {delay && (
          <div className="stock-alert">
            <i className="fa-solid fa-clock" /> {delay.text}
          </div>
        )}

        <ol className="loop-steps">
          {[
            ["Referred", r.createdAt],
            ["Booked", r.scheduledAt],
            ["Attended", r.attendedAt],
            ["Report back", r.reportReceivedAt],
            ["Loop closed", r.closedAt],
          ].map(([label, when]) => (
            <li key={label as string} className={when ? "done" : undefined}>
              <i className={`fa-solid ${when ? "fa-circle-check" : "fa-circle"}`} /> {label as string}
            </li>
          ))}
        </ol>

        <dl className="followup-facts">
          <dt>Urgency</dt>
          <dd>
            <span className={`status-pill ${URGENCY_CLASS[r.urgency]}`}>{URGENCY_LABEL[r.urgency]}</span>
          </dd>
          <dt>Reason</dt>
          <dd>{r.reason}</dd>
          <dt>Care navigator</dt>
          <dd>{r.navigator ? `${r.navigator.firstName} ${r.navigator.lastName}` : "Not assigned yet"}</dd>
          {r.appointmentAt && (
            <>
              <dt>Appointment</dt>
              <dd>
                {at(r.appointmentAt)}
                {r.appointmentId && <span className="section-sub"> · booked in MiDokta</span>}
              </dd>
            </>
          )}
          {r.nextStep && (
            <>
              <dt>Next step</dt>
              <dd>
                {r.nextStep}
                {r.nextStepDue && <span className="section-sub"> · by {formatDate(r.nextStepDue.toISOString())}</span>}
              </dd>
            </>
          )}
          <dt>Patient instructions</dt>
          <dd>{r.patientInstructions ?? <span className="section-sub">None yet: where to go, what to bring</span>}</dd>
          {r.reportSummary && (
            <>
              <dt>Specialist&apos;s report</dt>
              <dd>{r.reportSummary}</dd>
            </>
          )}
          {r.closureNote && r.closedAt && (
            <>
              <dt>Outcome (loop closed)</dt>
              <dd>
                {r.closureNote}
                <div className="section-sub">
                  {r.closedBy ? `Dr. ${r.closedBy.firstName} ${r.closedBy.lastName}, ` : ""}
                  {at(r.closedAt)}
                </div>
              </dd>
            </>
          )}
        </dl>

        <ReferralActions
          id={r.id}
          status={r.status}
          canClose={referrer}
          canCancel={referrer || user.id === r.navigatorId}
          navigatorId={r.navigator?.id ?? null}
          navigators={navigators.map((n) => ({ id: n.id, name: `${n.firstName} ${n.lastName}`, detail: n.role.toLowerCase() }))}
          nextStep={r.nextStep}
          nextStepDue={r.nextStepDue ? r.nextStepDue.toISOString().slice(0, 10) : ""}
          patientInstructions={r.patientInstructions}
          appointmentAt={local(r.appointmentAt)}
        />
      </section>

      <Timeline events={r.events} />
    </div>
  );
}
