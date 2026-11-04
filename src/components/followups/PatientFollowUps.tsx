import Link from "next/link";
import { type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { referralDelay, referralTarget, testDelay } from "@/lib/followups";
import { formatDate } from "@/components/appointments/shared";
import { REFERRAL_STATUS_CLASS, REFERRAL_STATUS_LABEL, TEST_STATUS_CLASS, TEST_STATUS_LABEL } from "./shared";

type Props = {
  patientId: string;
  basePath: string;
  /** Doctors see only what they ordered or referred; pass their scope. */
  testWhere?: Prisma.DiagnosticTestWhereInput;
  referralWhere?: Prisma.ReferralWhereInput;
  actions?: React.ReactNode;
};

/** A patient's tests and referrals, on their page in the staff portals. */
export default async function PatientFollowUps({ patientId, basePath, testWhere = {}, referralWhere = {}, actions }: Props) {
  const [tests, referrals] = await Promise.all([
    prisma.diagnosticTest.findMany({ where: { patientId, ...testWhere }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.referral.findMany({ where: { patientId, ...referralWhere }, orderBy: { createdAt: "desc" }, take: 30, include: { toDoctor: true } }),
  ]);

  return (
    <>
      <div className="appt-header detail-section-heading">
        <h2 className="section-heading">Tests &amp; Referrals</h2>
        {actions && <div className="appt-header-actions">{actions}</div>}
      </div>
      {tests.length + referrals.length === 0 ? (
        <div className="empty-banner">No tests or referrals yet.</div>
      ) : (
        <div className="card table-wrap">
          <table className="appt-table">
            <tbody>
              {tests.map((t) => {
                const delay = testDelay(t);
                return (
                  <tr key={t.id} className={delay ? "row-late" : undefined}>
                    <td>
                      <i className="fa-solid fa-vial" />{" "}
                      <Link href={`${basePath}/follow-ups/tests/${t.id}`} className="table-link">
                        {t.name}
                      </Link>
                      {t.abnormal && <span className="status-pill status-rejected">Abnormal</span>}
                      {delay && <div className="late-note">{delay.text}</div>}
                    </td>
                    <td>{formatDate(t.createdAt.toISOString())}</td>
                    <td>
                      <span className={`status-pill ${TEST_STATUS_CLASS[t.status]}`}>{TEST_STATUS_LABEL[t.status]}</span>
                    </td>
                  </tr>
                );
              })}
              {referrals.map((r) => {
                const delay = referralDelay(r);
                return (
                  <tr key={r.id} className={delay ? "row-late" : undefined}>
                    <td>
                      <i className="fa-solid fa-share-from-square" />{" "}
                      <Link href={`${basePath}/follow-ups/referrals/${r.id}`} className="table-link">
                        {r.specialty} · {referralTarget(r)}
                      </Link>
                      {delay && <div className="late-note">{delay.text}</div>}
                    </td>
                    <td>{formatDate(r.createdAt.toISOString())}</td>
                    <td>
                      <span className={`status-pill ${REFERRAL_STATUS_CLASS[r.status]}`}>{REFERRAL_STATUS_LABEL[r.status]}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
