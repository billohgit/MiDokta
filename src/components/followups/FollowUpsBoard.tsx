import Link from "next/link";
import { Role, type Prisma, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { referralDelay, referralTarget, testDelay } from "@/lib/followups";
import { formatDate } from "@/components/appointments/shared";
import { REFERRAL_STATUS_CLASS, REFERRAL_STATUS_LABEL, TEST_STATUS_CLASS, TEST_STATUS_LABEL, URGENCY_CLASS, URGENCY_LABEL } from "./shared";

const TABS = { tests: "Tests & results", referrals: "Referrals" } as const;
const SHOWS = { action: "Needs action", open: "All open", closed: "Finished" } as const;
type Tab = keyof typeof TABS;
type Show = keyof typeof SHOWS;

const OPEN_TESTS = ["ORDERED", "COLLECTED", "RESULTED", "REVIEWED"] as const;
const OPEN_REFERRALS = ["CREATED", "SCHEDULED", "ATTENDED", "REPORT_RECEIVED"] as const;

/** Which items a user follows: doctors their own; nurses, receptionists and admins everyone's. */
export function testScope(user: User): Prisma.DiagnosticTestWhereInput {
  return user.role === Role.DOCTOR ? { orderedById: user.id } : {};
}
export function referralScope(user: User): Prisma.ReferralWhereInput {
  return user.role === Role.DOCTOR ? { OR: [{ referredById: user.id }, { toDoctorId: user.id }] } : {};
}

type Props = { user: User; basePath: string; tab?: string; show?: string };

/** The follow-up tracker: pending tests and open referrals, late ones first. */
export default async function FollowUpsBoard({ user, basePath, tab: askedTab, show: askedShow }: Props) {
  const tab: Tab = askedTab === "referrals" ? "referrals" : "tests";
  const show: Show = askedShow === "open" || askedShow === "closed" ? askedShow : "action";
  const now = new Date();
  const closed = show === "closed";

  const [tests, referrals] = await Promise.all([
    prisma.diagnosticTest.findMany({
      where: { ...testScope(user), status: closed ? { in: ["COMMUNICATED", "CANCELLED"] } : { in: [...OPEN_TESTS] } },
      include: { patient: { select: { firstName: true, lastName: true } }, orderedBy: { select: { lastName: true } } },
      orderBy: closed ? { updatedAt: "desc" } : { dueAt: "asc" },
      take: closed ? 100 : 500,
    }),
    prisma.referral.findMany({
      where: { ...referralScope(user), status: closed ? { in: ["CLOSED", "CANCELLED"] } : { in: [...OPEN_REFERRALS] } },
      include: {
        patient: { select: { firstName: true, lastName: true } },
        referredBy: { select: { lastName: true } },
        toDoctor: { select: { firstName: true, lastName: true } },
        navigator: { select: { firstName: true, lastName: true } },
      },
      orderBy: closed ? { updatedAt: "desc" } : { createdAt: "asc" },
      take: closed ? 100 : 500,
    }),
  ]);

  // "Needs action" is what's late, plus what's waiting on this user's next move.
  const testRows = tests
    .map((t) => ({ t, delay: testDelay(t, now) }))
    .filter(({ t, delay }) => show !== "action" || delay || (user.role === Role.DOCTOR ? t.status === "RESULTED" || t.status === "REVIEWED" : t.status === "ORDERED"));
  const referralRows = referrals
    .map((r) => ({ r, delay: referralDelay(r, now) }))
    .filter(({ r, delay }) => show !== "action" || delay || (r.referredById === user.id ? r.status === "REPORT_RECEIVED" : user.role !== Role.DOCTOR && r.status === "CREATED"));
  const late = (rows: { delay: unknown }[]) => rows.filter((x) => x.delay).length;
  // Late ones first.
  testRows.sort((a, b) => Number(!!b.delay) - Number(!!a.delay));
  referralRows.sort((a, b) => Number(!!b.delay) - Number(!!a.delay) || urgencyRank(b.r.urgency) - urgencyRank(a.r.urgency));

  const href = (t: Tab, s: Show) => `${basePath}/follow-ups?tab=${t}&show=${s}`;

  return (
    <div className="settings">
      <div className="appt-header">
        <div>
          <h2 className="section-heading">Follow-ups</h2>
          <p className="section-sub">
            Pending tests and results, and referrals until the loop is closed.
            {!closed && ` ${late(testRows) + late(referralRows)} late.`}
          </p>
        </div>
      </div>

      <div className="all-header">
        <div className="segmented" role="tablist">
          {(Object.keys(TABS) as Tab[]).map((t) => (
            <Link key={t} href={href(t, show)} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""}>
              {TABS[t]}
            </Link>
          ))}
        </div>
        <div className="segmented">
          {(Object.keys(SHOWS) as Show[]).map((s) => (
            <Link key={s} href={href(tab, s)} className={show === s ? "on" : ""}>
              {SHOWS[s]}
            </Link>
          ))}
        </div>
      </div>

      {tab === "tests" ? (
        testRows.length === 0 ? (
          <div className="empty-banner">{show === "action" ? "No tests need action. 👍" : "No tests here."}</div>
        ) : (
          <div className="card table-wrap">
            <table className="appt-table">
              <thead>
                <tr>
                  <th>Test</th>
                  <th>Patient</th>
                  <th>Status</th>
                  <th>Result due</th>
                  {user.role !== Role.DOCTOR && <th>Ordered by</th>}
                </tr>
              </thead>
              <tbody>
                {testRows.map(({ t, delay }) => (
                  <tr key={t.id} className={delay ? "row-late" : undefined}>
                    <td>
                      <Link href={`${basePath}/follow-ups/tests/${t.id}`} className="table-link">
                        {t.name}
                      </Link>{" "}
                      {t.urgency !== "ROUTINE" && <span className={`status-pill ${URGENCY_CLASS[t.urgency]}`}>{URGENCY_LABEL[t.urgency]}</span>}
                      {t.abnormal && <span className="status-pill status-rejected">Abnormal</span>}
                      {delay && <div className="late-note"><i className="fa-solid fa-clock" /> {delay.text}</div>}
                    </td>
                    <td>
                      {t.patient.firstName} {t.patient.lastName}
                    </td>
                    <td>
                      <span className={`status-pill ${TEST_STATUS_CLASS[t.status]}`}>{TEST_STATUS_LABEL[t.status]}</span>
                    </td>
                    <td>{formatDate(t.dueAt.toISOString())}</td>
                    {user.role !== Role.DOCTOR && <td>Dr. {t.orderedBy.lastName}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : referralRows.length === 0 ? (
        <div className="empty-banner">{show === "action" ? "No referrals need action. 👍" : "No referrals here."}</div>
      ) : (
        <div className="card table-wrap">
          <table className="appt-table">
            <thead>
              <tr>
                <th>Referral</th>
                <th>Patient</th>
                <th>Status</th>
                <th>Navigator</th>
                <th>Referred</th>
              </tr>
            </thead>
            <tbody>
              {referralRows.map(({ r, delay }) => (
                <tr key={r.id} className={delay ? "row-late" : undefined}>
                  <td>
                    <Link href={`${basePath}/follow-ups/referrals/${r.id}`} className="table-link">
                      {r.specialty} · {referralTarget(r)}
                    </Link>{" "}
                    {r.urgency !== "ROUTINE" && <span className={`status-pill ${URGENCY_CLASS[r.urgency]}`}>{URGENCY_LABEL[r.urgency]}</span>}
                    {delay && <div className="late-note"><i className="fa-solid fa-clock" /> {delay.text}</div>}
                    {!delay && r.nextStep && <div className="section-sub">Next: {r.nextStep}</div>}
                  </td>
                  <td>
                    {r.patient.firstName} {r.patient.lastName}
                  </td>
                  <td>
                    <span className={`status-pill ${REFERRAL_STATUS_CLASS[r.status]}`}>{REFERRAL_STATUS_LABEL[r.status]}</span>
                    {r.appointmentAt && r.status === "SCHEDULED" && <div className="section-sub">{formatDate(r.appointmentAt.toISOString())}</div>}
                  </td>
                  <td>{r.navigator ? `${r.navigator.firstName} ${r.navigator.lastName}` : <span className="section-sub">Unassigned</span>}</td>
                  <td>
                    {formatDate(r.createdAt.toISOString())}
                    <div className="section-sub">by Dr. {r.referredBy.lastName}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const urgencyRank = (u: string) => (u === "EMERGENCY" ? 2 : u === "URGENT" ? 1 : 0);
