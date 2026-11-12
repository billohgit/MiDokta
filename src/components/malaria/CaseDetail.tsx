import Link from "next/link";
import { notFound } from "next/navigation";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatDistance } from "@/lib/geo";
import { HEALTH_WORKER_ROLES, OPEN_STATUSES, malariaDelay, treatmentDay } from "@/lib/malaria/cases";
import { DANGER_SIGNS, SYMPTOMS } from "@/lib/malaria/screening";
import { formatDate, formatTime } from "@/components/appointments/shared";
import Timeline from "@/components/followups/Timeline";
import { FOR_WHOM_LABEL, STATUS_CLASS, STATUS_LABEL } from "./shared";
import CaseActions from "./CaseActions";

const when = (d: Date) => `${formatDate(d.toISOString())}, ${formatTime(d.toISOString())}`;
const person = (u: { firstName: string; lastName: string; role: string } | null) => (u ? `${u.role === "DOCTOR" ? "Dr. " : ""}${u.firstName} ${u.lastName}` : null);

/** One malaria case: the check, the referral, the test, the plan, adherence and the timeline. */
export default async function CaseDetail({ id, user, basePath }: { id: string; user: User; basePath: string }) {
  const c = await prisma.malariaCase.findUnique({
    where: { id },
    include: {
      patient: true,
      screening: true,
      pharmacy: true,
      doses: true,
      testedBy: true,
      planDraftedBy: true,
      planApprovedBy: true,
      events: { orderBy: { createdAt: "asc" }, include: { actor: { select: { firstName: true, lastName: true, role: true } } } },
    },
  });
  if (!c) notFound();

  const canAct = HEALTH_WORKER_ROLES.includes(user.role);
  const delay = malariaDelay(c);
  const day = treatmentDay(c);
  const answers = (c.screening?.answers ?? {}) as Record<string, boolean>;
  const myHospital = user.hospitalId ? await prisma.hospital.findUnique({ where: { id: user.hospitalId }, select: { name: true } }) : null;

  return (
    <div className="settings malaria-detail">
      <Link href={`${basePath}/malaria`} className="back-link">
        <i className="fa-solid fa-arrow-left" /> Malaria cases
      </Link>
      <div className="appt-header">
        <div>
          <h2 className="section-heading">
            Malaria case #{c.number}
            {c.urgency === "EMERGENCY" && <span className="status-pill status-rejected malaria-danger-pill">Danger signs</span>}
          </h2>
          <p className="section-sub">
            {c.patient.firstName} {c.patient.lastName}
            {c.patient.phone ? ` · ${c.patient.phone}` : ""} · opened {when(c.createdAt)}
            {c.openedById ? "" : " by Omega's check"}
          </p>
        </div>
        <span className={`status-pill ${STATUS_CLASS[c.status]}`}>{STATUS_LABEL[c.status]}</span>
      </div>
      {delay && <div className="empty-banner late-banner">{delay.text}</div>}

      <div className="malaria-detail-grid">
        <section className="card my-invoice">
          <h3 className="details-subhead">Check and referral</h3>
          <dl className="followup-facts">
            {c.screening && (
              <>
                <dt>Score</dt>
                <dd>
                  {c.screening.score}% of malaria symptoms · {FOR_WHOM_LABEL[c.screening.forWhom]}
                </dd>
                <dt>Symptoms</dt>
                <dd>{SYMPTOMS.filter((q) => answers[q.id]).map((q) => q.id === "noNet" ? "slept without a net" : q.id === "contact" ? "malaria at home" : q.id).join(", ") || "none"}</dd>
                <dt>Danger signs</dt>
                <dd>{c.screening.dangerSigns.map((d) => DANGER_SIGNS.find((s) => s.id === d)?.label ?? d).join(", ") || "none"}</dd>
              </>
            )}
            <dt>District</dt>
            <dd>{c.district ?? "Not given"}</dd>
            <dt>Referred to</dt>
            <dd>
              {c.facilityName ?? "Nearest health centre"}
              {c.facilityDistanceKm != null ? ` (${formatDistance(c.facilityDistanceKm)} from the patient)` : ""}
            </dd>
            {c.pharmacy && (
              <>
                <dt>Pharmacy</dt>
                <dd>{c.pharmacy.name}</dd>
              </>
            )}
          </dl>
        </section>

        <section className="card my-invoice">
          <h3 className="details-subhead">Test and treatment</h3>
          <dl className="followup-facts">
            <dt>Test</dt>
            <dd>
              {c.testedOn
                ? `${c.testPositive ? "Positive" : "Negative"} by ${c.testType === "RDT" ? "RDT" : "microscopy"}${c.species ? `, ${c.species}` : ""} · ${c.testedAt ?? ""} · ${when(c.testedOn)} by ${person(c.testedBy)}`
                : "Not tested yet"}
            </dd>
            {c.testNote && (
              <>
                <dt>Test note</dt>
                <dd>{c.testNote}</dd>
              </>
            )}
            <dt>Plan</dt>
            <dd>
              {c.planText ? (
                <>
                  {c.planText} ({c.planDays} days, {c.dosesPerDay}× a day)
                  <br />
                  <span className="section-sub">
                    {c.planApprovedAt ? `Approved by ${person(c.planApprovedBy)}, ${when(c.planApprovedAt)}` : `Drafted by ${person(c.planDraftedBy)}: waiting for a doctor's approval`}
                  </span>
                </>
              ) : (
                "None yet"
              )}
            </dd>
            {c.planDays && c.treatmentStartsAt && (
              <>
                <dt>Adherence</dt>
                <dd>
                  {c.doses.length} of {c.planDays} days ticked by the patient
                  {c.status === "TREATMENT" && day <= c.planDays ? ` · today is day ${day}` : ""}
                </dd>
              </>
            )}
            {c.patientOutcome && (
              <>
                <dt>Patient says</dt>
                <dd>{{ BETTER: "Finished, feels better", STILL_SICK: "Finished, still unwell", NOT_FINISHED: "Didn't finish" }[c.patientOutcome] ?? c.patientOutcome}</dd>
              </>
            )}
            {c.closingNote && (
              <>
                <dt>Closing note</dt>
                <dd>{c.closingNote}</dd>
              </>
            )}
          </dl>
        </section>
      </div>

      {canAct && (OPEN_STATUSES as readonly string[]).includes(c.status) && (
        <CaseActions
          caseId={c.id}
          status={c.status}
          isDoctor={user.role === "DOCTOR"}
          testedAtDefault={myHospital?.name ?? c.facilityName ?? ""}
          plan={c.planText ? { text: c.planText, days: c.planDays ?? 3, dosesPerDay: c.dosesPerDay ?? 2, approved: !!c.planApprovedAt } : null}
        />
      )}

      <Timeline events={c.events} />
    </div>
  );
}
