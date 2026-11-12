import Link from "next/link";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import {
  MALARIA_PERIODS,
  type MalariaPeriod,
  REPORT_COLUMNS,
  currentMonth,
  facilityReport,
  isMonth,
  malariaOverview,
} from "@/lib/malaria/analytics";
import { weeklyTipSettings } from "@/lib/malaria/cases";
import { formatDate } from "@/components/appointments/shared";
import BarList from "@/components/insights/BarList";
import CaseBoard from "@/components/malaria/CaseBoard";
import {
  CampaignForm,
  WeeklyTipSettings,
} from "@/components/malaria/PreventionForms";

export const dynamic = "force-dynamic";

const VIEWS = {
  overview: "Overview",
  areas: "By district",
  facilities: "Facility report",
  cases: "Cases",
  prevention: "Prevention",
} as const;
type View = keyof typeof VIEWS;
type Search = { view?: string; period?: string; month?: string; tab?: string };

const pct = (v: number | null) => (v === null ? "—" : `${v}%`);

/** The malaria program: aggregated figures, geographic trends, facility reports, cases and prevention messages. */
export default async function AdminMalariaPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  await requireUser(Role.ADMIN);
  const q = await searchParams;
  const view: View = q.view && q.view in VIEWS ? (q.view as View) : "overview";
  const period: MalariaPeriod =
    q.period && q.period in MALARIA_PERIODS
      ? (q.period as MalariaPeriod)
      : "90";
  const href = (o: Search) => {
    const p = new URLSearchParams({ view, period, ...o } as Record<
      string,
      string
    >);
    return `/admin/malaria?${p}`;
  };

  return (
    <div className="settings">
      <div className="appt-header">
        <div>
          <h2 className="section-heading">Malaria program</h2>
          <p className="section-sub">
            Checks by Omega and health workers, the care cascade, districts and
            facilities. Counts only: no patient names leave this page except
            under Cases.
          </p>
        </div>
      </div>

      <div className="all-header">
        <div className="segmented" role="tablist" aria-label="Malaria views">
          {(Object.keys(VIEWS) as View[]).map((v) => (
            <Link
              key={v}
              href={href({ view: v })}
              role="tab"
              aria-selected={view === v}
              className={view === v ? "on" : ""}
            >
              {VIEWS[v]}
            </Link>
          ))}
        </div>
      </div>

      {(view === "overview" || view === "areas") && (
        <div className="all-header">
          <div className="segmented" role="tablist" aria-label="Time period">
            {(Object.keys(MALARIA_PERIODS) as MalariaPeriod[]).map((p) => (
              <Link
                key={p}
                href={href({ period: p })}
                role="tab"
                aria-selected={period === p}
                className={period === p ? "on" : ""}
              >
                {MALARIA_PERIODS[p]}
              </Link>
            ))}
          </div>
        </div>
      )}

      {view === "overview" && <Overview period={period} />}
      {view === "areas" && <Areas period={period} />}
      {view === "facilities" && (
        <Facilities month={isMonth(q.month) ? q.month : currentMonth()} />
      )}
      {view === "cases" && (
        <CaseBoard
          basePath="/admin"
          tab={q.tab}
          canScreen={false}
          tabHref={(t) => href({ view: "cases", tab: t })}
        />
      )}
      {view === "prevention" && <Prevention />}
    </div>
  );
}

async function Overview({ period }: { period: MalariaPeriod }) {
  const { totals: t, cascade, weeks } = await malariaOverview(period);
  return (
    <>
      <section className="card insight-hero">
        <div>
          <span className="insight-hero-number">
            {t.checks.toLocaleString()}
          </span>
          <span className="insight-hero-label">
            malaria checks · {MALARIA_PERIODS[period].toLowerCase()}
          </span>
        </div>
        <dl className="insight-stats">
          <div>
            <dt>Checks suggesting malaria</dt>
            <dd>{t.suspected.toLocaleString()}</dd>
          </div>
          <div>
            <dt>With danger signs</dt>
            <dd>{t.danger.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Test positivity</dt>
            <dd>{pct(t.positivity)}</dd>
          </div>
          <div>
            <dt title="Of treatments that have ended">Treatment completion</dt>
            <dd>{pct(t.completion)}</dd>
          </div>
          <div>
            <dt>Median time to test</dt>
            <dd>
              {t.medianHoursToTest === null
                ? "—"
                : t.medianHoursToTest < 48
                  ? `${Math.round(t.medianHoursToTest)} h`
                  : `${Math.round(t.medianHoursToTest / 24)} days`}
            </dd>
          </div>
          <div>
            <dt>Open cases · need follow-up</dt>
            <dd>
              {t.open} · {t.needsFollowUp}
            </dd>
          </div>
          <div>
            <dt>Children under 5 · pregnant</dt>
            <dd>
              {t.children} · {t.pregnant}
            </dd>
          </div>
        </dl>
      </section>

      <div className="insight-grid">
        <section className="card insight-card">
          <h3 className="insight-title">Care cascade</h3>
          <p className="section-sub">
            Each step, and the share of the step before that reached it.
          </p>
          <div className="table-wrap">
            <table className="appt-table malaria-table">
              <thead>
                <tr>
                  <th>Step</th>
                  <th className="num">Count</th>
                  <th className="num">Of previous</th>
                </tr>
              </thead>
              <tbody>
                {cascade.map((s) => (
                  <tr key={s.label}>
                    <td>{s.label}</td>
                    <td className="num">{s.count.toLocaleString()}</td>
                    <td className="num">
                      {s.ofPrevious === null ? "" : pct(s.ofPrevious)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card insight-card">
          <h3 className="insight-title">Last 12 weeks</h3>
          <p className="section-sub">
            Checks and suspected cases by the week they were made; positives by
            test date.
          </p>
          <div className="table-wrap">
            <table className="appt-table malaria-table">
              <thead>
                <tr>
                  <th>Week of</th>
                  <th className="num">Checks</th>
                  <th className="num">Suspected</th>
                  <th className="num">Positive</th>
                </tr>
              </thead>
              <tbody>
                {[...weeks].reverse().map((w) => (
                  <tr key={w.start.toISOString()}>
                    <td>{formatDate(w.start.toISOString())}</td>
                    <td className="num">{w.checks}</td>
                    <td className="num">{w.suspected}</td>
                    <td className="num">{w.positive}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

async function Areas({ period }: { period: MalariaPeriod }) {
  const { byDistrict } = await malariaOverview(period);
  const totalCases = byDistrict.reduce((s, d) => s + d.cases, 0);
  return (
    <>
      <div className="insight-grid">
        <BarList
          title="Suspected cases by district"
          subtitle={`Where patients said they were when checked · ${MALARIA_PERIODS[period].toLowerCase()}`}
          rows={byDistrict
            .filter((d) => d.cases > 0)
            .map((d) => ({ label: d.district, count: d.cases }))}
          unit="case"
          total={totalCases}
          empty="No suspected cases in this period."
        />
        <BarList
          title="Positive tests by district"
          subtitle="Confirmed malaria, by district"
          rows={byDistrict
            .filter((d) => d.positive > 0)
            .map((d) => ({ label: d.district, count: d.positive }))
            .sort((a, b) => b.count - a.count)}
          unit="positive test"
          total={byDistrict.reduce((s, d) => s + d.positive, 0)}
          empty="No positive tests in this period."
        />
      </div>
      <section className="card table-wrap">
        <table className="appt-table malaria-table">
          <thead>
            <tr>
              <th>District</th>
              <th className="num">Checks</th>
              <th className="num">Suspected</th>
              {period !== "all" && <th className="num">Change</th>}
              <th className="num">Tested</th>
              <th className="num">Positive</th>
              <th className="num">Positivity</th>
              <th className="num">Completed</th>
            </tr>
          </thead>
          <tbody>
            {byDistrict.length === 0 && (
              <tr>
                <td colSpan={8}>No checks in this period.</td>
              </tr>
            )}
            {byDistrict.map((d) => {
              const change = d.previous === null ? null : d.cases - d.previous;
              return (
                <tr key={d.district}>
                  <td>{d.district}</td>
                  <td className="num">{d.checks}</td>
                  <td className="num">{d.cases}</td>
                  {period !== "all" && (
                    <td
                      className={`num ${change && change > 0 ? "trend-up" : change && change < 0 ? "trend-down" : ""}`}
                      title="Compared with the period before"
                    >
                      {change === null
                        ? ""
                        : change > 0
                          ? `▲ ${change}`
                          : change < 0
                            ? `▼ ${-change}`
                            : "–"}
                    </td>
                  )}
                  <td className="num">{d.tested}</td>
                  <td className="num">{d.positive}</td>
                  <td className="num">{pct(d.positivity)}</td>
                  <td className="num">{d.completed}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <p className="form-note">
        Change compares suspected cases with the same length of time just
        before. A rising district is a signal to send prevention messages there
        (Prevention tab).
      </p>
    </>
  );
}

async function Facilities({ month }: { month: string }) {
  const report = await facilityReport(month);
  return (
    <>
      <form className="all-header malaria-month" method="get">
        <input type="hidden" name="view" value="facilities" />
        <label className="field">
          <span>Month</span>
          <input
            type="month"
            name="month"
            defaultValue={month}
            max={currentMonth()}
          />
        </label>
        <button type="submit" className="btn btn-outline">
          Show
        </button>
        <a
          className="btn btn-primary"
          href={`/api/malaria/report?month=${month}`}
        >
          <i className="fa-solid fa-file-csv btn-icon" /> Download CSV
        </a>
      </form>
      <section className="card table-wrap">
        <table className="appt-table malaria-table">
          <thead>
            <tr>
              {REPORT_COLUMNS.map(([k, h]) => (
                <th key={k} className={k === "facility" ? undefined : "num"}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.rows.length === 0 && (
              <tr>
                <td colSpan={REPORT_COLUMNS.length}>
                  No cases referred or tested this month.
                </td>
              </tr>
            )}
            {[
              ...report.rows,
              ...(report.rows.length ? [report.total] : []),
            ].map((r) => (
              <tr
                key={r.facility}
                className={r === report.total ? "total-row" : undefined}
              >
                {REPORT_COLUMNS.map(([k]) => (
                  <td key={k} className={k === "facility" ? undefined : "num"}>
                    {r[k]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="form-note">
        Referred counts cases by the facility Omega or the health worker sent
        the patient to; tested and later columns count by where the test was
        done. The report holds counts only, for sharing with the district health
        team.
      </p>
    </>
  );
}

async function Prevention() {
  const [settings, campaigns] = await Promise.all([
    weeklyTipSettings(),
    prisma.malariaCampaign.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { sentBy: { select: { firstName: true, lastName: true } } },
    }),
  ]);
  return (
    <>
      <div className="malaria-detail-grid">
        <CampaignForm />
        <WeeklyTipSettings inApp={settings.inApp} sms={settings.sms} />
      </div>
      <h3 className="details-subhead">Messages sent</h3>
      {campaigns.length === 0 ? (
        <div className="empty-banner">No prevention messages sent yet.</div>
      ) : (
        <div className="card table-wrap">
          <table className="appt-table">
            <thead>
              <tr>
                <th>Sent</th>
                <th>Message</th>
                <th>To</th>
                <th>How</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td>{formatDate(c.createdAt.toISOString())}</td>
                  <td className="malaria-message-cell">{c.body}</td>
                  <td>
                    {c.recipients} patient{c.recipients === 1 ? "" : "s"}
                    {c.district ? ` in ${c.district}` : ""}
                  </td>
                  <td>
                    {[c.inApp && "App", c.sms && `SMS (${c.smsQueued})`]
                      .filter(Boolean)
                      .join(" + ")}
                  </td>
                  <td>
                    {c.automatic
                      ? "Omega (weekly)"
                      : c.sentBy
                        ? `${c.sentBy.firstName} ${c.sentBy.lastName}`
                        : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
