import { prisma } from "@/lib/prisma";
import { referralTarget } from "@/lib/followups";
import { formatDate, formatTime } from "@/components/appointments/shared";

/** How a test reads to the patient. They see a result only once their doctor has reviewed it and they've been told. */
const TEST_FOR_PATIENT = {
  ORDERED: "Waiting for your sample",
  COLLECTED: "Waiting for the result",
  RESULTED: "Your doctor is reviewing the result",
  REVIEWED: "Your doctor is reviewing the result",
  COMMUNICATED: "Result ready",
  CANCELLED: "Cancelled",
} as const;

const REFERRAL_FOR_PATIENT = {
  CREATED: "We're arranging your appointment",
  SCHEDULED: "Appointment booked",
  ATTENDED: "Waiting for the specialist's report",
  REPORT_RECEIVED: "Your doctor is reviewing the specialist's report",
  CLOSED: "Completed",
  CANCELLED: "Cancelled",
} as const;

/** The patient's own tests and referrals, on their records page. */
export default async function MyFollowUps({ patientId }: { patientId: string }) {
  const [tests, referrals] = await Promise.all([
    prisma.diagnosticTest.findMany({ where: { patientId }, orderBy: { createdAt: "desc" }, take: 30, include: { orderedBy: { select: { lastName: true } } } }),
    prisma.referral.findMany({ where: { patientId, status: { not: "CANCELLED" } }, orderBy: { createdAt: "desc" }, take: 20, include: { toDoctor: true } }),
  ]);
  if (tests.length + referrals.length === 0) return null;

  return (
    <>
      <h2 className="section-heading detail-section-heading">Tests &amp; Referrals</h2>
      <div className="my-followups">
        {referrals.map((r) => (
          <article key={r.id} className="card my-followup">
            <h3>
              <i className="fa-solid fa-share-from-square" /> Referral to {referralTarget(r)} · {r.specialty}
            </h3>
            <p className="section-sub">{REFERRAL_FOR_PATIENT[r.status]}</p>
            {r.appointmentAt && r.status === "SCHEDULED" && (
              <p>
                <strong>
                  {formatDate(r.appointmentAt.toISOString())} at {formatTime(r.appointmentAt.toISOString())}
                </strong>
              </p>
            )}
            {r.patientInstructions && r.status !== "CLOSED" && <p className="my-followup-note">{r.patientInstructions}</p>}
            {r.status === "CLOSED" && r.closureNote && <p className="my-followup-note">{r.closureNote}</p>}
          </article>
        ))}
        {tests.map((t) => {
          const ready = t.status === "COMMUNICATED";
          return (
            <article key={t.id} className="card my-followup">
              <h3>
                <i className="fa-solid fa-vial" /> {t.name}
              </h3>
              <p className="section-sub">
                {TEST_FOR_PATIENT[t.status]} · ordered by Dr. {t.orderedBy.lastName} on {formatDate(t.createdAt.toISOString())}
              </p>
              {ready && (
                <>
                  {t.abnormal && <p className="pay-status">Your doctor would like to talk to you about this result. Please contact the clinic.</p>}
                  {t.result && <p className="my-followup-note">{t.result}</p>}
                  {t.reviewNote && (
                    <p>
                      <strong>Your doctor:</strong> {t.reviewNote}
                    </p>
                  )}
                </>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}
