import Link from "next/link";
import { notFound } from "next/navigation";
import { Role, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { testDelay } from "@/lib/followups";
import { formatDate, formatTime } from "@/components/appointments/shared";
import Timeline from "./Timeline";
import TestActions from "./TestActions";
import { KIND_LABEL, TEST_STATUS_CLASS, TEST_STATUS_LABEL, URGENCY_CLASS, URGENCY_LABEL } from "./shared";

const at = (d: Date) => `${formatDate(d.toISOString())}, ${formatTime(d.toISOString())}`;

/** One test, from order to the patient knowing the result, with what this user can do next. */
export default async function TestDetail({ id, user, basePath }: { id: string; user: User; basePath: string }) {
  const t = await prisma.diagnosticTest.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
      orderedBy: { select: { firstName: true, lastName: true } },
      resultBy: { select: { firstName: true, lastName: true } },
      events: { orderBy: { createdAt: "asc" }, include: { actor: { select: { firstName: true, lastName: true, role: true } } } },
    },
  });
  // Doctors follow the tests they ordered.
  if (!t || (user.role === Role.DOCTOR && t.orderedById !== user.id)) notFound();
  const delay = testDelay(t);
  const orderer = user.id === t.orderedById || user.role === Role.ADMIN;

  return (
    <div className="settings">
      <Link href={`${basePath}/follow-ups?tab=tests`} className="back-link">
        <i className="fa-solid fa-arrow-left" /> Follow-ups
      </Link>

      <section className="card my-invoice">
        <header className="my-invoice-head">
          <div>
            <h2 className="section-heading">{t.name}</h2>
            <p className="section-sub">
              {KIND_LABEL[t.kind]} · for{" "}
              <Link href={`${basePath}/patients/${t.patient.id}`} className="table-link">
                {t.patient.firstName} {t.patient.lastName}
              </Link>
              {t.patient.phone && ` · ${t.patient.phone}`} · ordered by Dr. {t.orderedBy.firstName} {t.orderedBy.lastName} on {at(t.createdAt)}
            </p>
          </div>
          <span className={`status-pill ${TEST_STATUS_CLASS[t.status]}`}>{TEST_STATUS_LABEL[t.status]}</span>
        </header>
        {delay && (
          <div className="stock-alert">
            <i className="fa-solid fa-clock" /> {delay.text}
          </div>
        )}
        <dl className="followup-facts">
          <dt>Urgency</dt>
          <dd>
            <span className={`status-pill ${URGENCY_CLASS[t.urgency]}`}>{URGENCY_LABEL[t.urgency]}</span>
          </dd>
          <dt>Result due</dt>
          <dd>{at(t.dueAt)}</dd>
          {t.question && (
            <>
              <dt>Clinical question</dt>
              <dd>{t.question}</dd>
            </>
          )}
          {t.result && (
            <>
              <dt>Result</dt>
              <dd className="followup-result">
                {t.abnormal && <span className="status-pill status-rejected">Abnormal</span>} {t.result}
                {t.resultBy && t.resultedAt && (
                  <div className="section-sub">
                    Entered by {t.resultBy.firstName} {t.resultBy.lastName}, {at(t.resultedAt)}
                  </div>
                )}
              </dd>
            </>
          )}
          {t.reviewedAt && (
            <>
              <dt>Doctor&apos;s review</dt>
              <dd>
                {t.reviewNote ?? "Reviewed"} <span className="section-sub">· {at(t.reviewedAt)}</span>
              </dd>
            </>
          )}
          {t.communicatedAt && (
            <>
              <dt>Patient told</dt>
              <dd>{at(t.communicatedAt)}</dd>
            </>
          )}
        </dl>

        <TestActions
          id={t.id}
          status={t.status}
          kind={t.kind}
          abnormal={t.abnormal ?? false}
          canEnter={user.role === Role.DOCTOR || user.role === Role.NURSE || user.role === Role.ADMIN}
          canReview={orderer}
          canTell={orderer || user.role === Role.NURSE}
        />
      </section>

      <Timeline events={t.events} />
    </div>
  );
}
