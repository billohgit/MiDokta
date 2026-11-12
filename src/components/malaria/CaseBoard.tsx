import Link from "next/link";
import { type Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OPEN_STATUSES, malariaDelay } from "@/lib/malaria/cases";
import { formatDate } from "@/components/appointments/shared";
import { FOR_WHOM_LABEL, STATUS_CLASS, STATUS_LABEL } from "./shared";
import ScreenPatientButton from "./ScreenPatientButton";

const TABS = { open: "Open", action: "Needs action", closed: "Closed", all: "All" } as const;
type Tab = keyof typeof TABS;

type Props = { basePath: string; tab?: string; canScreen: boolean; tabHref?: (tab: string) => string };

/** Malaria cases for health workers (and, read-only, admins): newest and most urgent first. */
export default async function CaseBoard({ basePath, tab: asked, canScreen, tabHref = (t) => `${basePath}/malaria?tab=${t}` }: Props) {
  const tab: Tab = asked && asked in TABS ? (asked as Tab) : "open";
  const where: Prisma.MalariaCaseWhereInput =
    tab === "closed"
      ? { status: { notIn: [...OPEN_STATUSES] } }
      : tab === "all"
        ? {}
        : { status: { in: [...OPEN_STATUSES] } };
  const [cases, patients] = await Promise.all([
    prisma.malariaCase.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: 200,
      include: { patient: { select: { firstName: true, lastName: true, phone: true } }, screening: { select: { forWhom: true, score: true } } },
    }),
    canScreen
      ? prisma.user.findMany({ where: { role: Role.PATIENT, isActive: true }, orderBy: [{ firstName: "asc" }, { lastName: "asc" }], take: 1000, select: { id: true, firstName: true, lastName: true, phone: true, state: true } })
      : Promise.resolve([]),
  ]);

  const rows = cases
    .map((c) => ({ c, delay: malariaDelay(c) }))
    .filter(({ c, delay }) => tab !== "action" || delay || c.status === "INCOMPLETE" || (c.status === "POSITIVE" && !!c.planText && !c.planApprovedAt))
    // Emergencies first, then anything late.
    .sort((a, b) => Number(b.c.urgency === "EMERGENCY" && b.c.status === "REFERRED") - Number(a.c.urgency === "EMERGENCY" && a.c.status === "REFERRED") || Number(!!b.delay) - Number(!!a.delay));

  return (
    <div className="settings">
      <div className="appt-header">
        <div>
          <h2 className="section-heading">Malaria cases</h2>
          <p className="section-sub">Suspected cases from Omega&apos;s check and from health workers, followed from test to completed treatment.</p>
        </div>
        {canScreen && (
          <div className="appt-header-actions">
            <ScreenPatientButton basePath={basePath} patients={patients.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, phone: p.phone, district: p.state }))} />
          </div>
        )}
      </div>

      <div className="all-header">
        <div className="segmented" role="tablist" aria-label="Cases">
          {(Object.keys(TABS) as Tab[]).map((t) => (
            <Link key={t} href={tabHref(t)} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""}>
              {TABS[t]}
            </Link>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty-banner">{tab === "action" ? "Nothing needs action right now." : "No malaria cases here."}</div>
      ) : (
        <div className="card table-wrap">
          <table className="appt-table">
            <thead>
              <tr>
                <th>Case</th>
                <th>Patient</th>
                <th>Status</th>
                <th>District</th>
                <th>Referred to</th>
                <th>Opened</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, delay }) => (
                <tr key={c.id} className={delay ? "row-late" : undefined}>
                  <td>
                    <Link href={`${basePath}/malaria/${c.id}`} className="table-link">
                      #{c.number}
                    </Link>
                    {c.urgency === "EMERGENCY" && <span className="status-pill status-rejected malaria-danger-pill">Danger signs</span>}
                  </td>
                  <td>
                    {c.patient.firstName} {c.patient.lastName}
                    <div className="section-sub">
                      {c.screening ? `${FOR_WHOM_LABEL[c.screening.forWhom]} · ${c.screening.score}%` : ""}
                      {c.patient.phone ? ` · ${c.patient.phone}` : ""}
                    </div>
                  </td>
                  <td>
                    <span className={`status-pill ${STATUS_CLASS[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                    {delay && <div className="late-note">{delay.text}</div>}
                  </td>
                  <td>{c.district ?? "—"}</td>
                  <td>{c.facilityName ?? "—"}</td>
                  <td>{formatDate(c.createdAt.toISOString())}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
