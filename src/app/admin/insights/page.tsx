import Link from "next/link";
import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { PERIODS, clinicInsights, type Period } from "@/lib/insights";
import BarList from "@/components/insights/BarList";

export const dynamic = "force-dynamic";

/** The illnesses seen most, and the medicines most prescribed and bought. */
export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await requireUser(Role.ADMIN);
  const { period: asked } = await searchParams;
  const period: Period = asked && asked in PERIODS ? (asked as Period) : "90";
  const data = await clinicInsights(period);
  const t = data.totals;

  return (
    <div className="settings">
      <div className="appt-header">
        <div>
          <h2 className="section-heading">Insights</h2>
          <p className="section-sub">The illnesses seen most, and the medicines most prescribed and bought. {PERIODS[period]}.</p>
        </div>
      </div>

      <div className="all-header">
        <div className="segmented" role="tablist" aria-label="Time period">
          {(Object.keys(PERIODS) as Period[]).map((p) => (
            <Link key={p} href={`/admin/insights?period=${p}`} role="tab" aria-selected={period === p} className={period === p ? "on" : ""}>
              {PERIODS[p]}
            </Link>
          ))}
        </div>
      </div>

      <section className="card insight-hero">
        <div>
          <span className="insight-hero-number">{t.visits.toLocaleString()}</span>
          <span className="insight-hero-label">visits recorded</span>
        </div>
        <dl className="insight-stats">
          <div>
            <dt>Patients seen</dt>
            <dd>{t.patients.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Different diagnoses</dt>
            <dd>{t.distinctDiagnoses.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Medicines prescribed</dt>
            <dd>{t.prescriptions.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Units sold in the shop</dt>
            <dd>{t.unitsSold.toLocaleString()}</dd>
          </div>
        </dl>
      </section>

      <div className="insight-grid">
        <BarList
          title="Most common illnesses"
          subtitle="Diagnoses in visit records, by number of visits"
          rows={data.diagnoses}
          unit="visit"
          total={t.visits}
          empty="No visits recorded in this period."
        />
        <BarList
          title="Most prescribed medicines"
          subtitle="Times written on a prescription, all strengths together"
          rows={data.prescribed}
          unit="prescription"
          total={t.prescriptions}
          empty="No prescriptions written in this period."
        />
        <BarList
          title="Most bought medicines"
          subtitle="Units sold in the pharmacy shop (paid orders), all strengths together"
          rows={data.bought}
          unit="unit"
          total={t.unitsSold}
          empty="Nothing sold in the shop in this period."
        />
      </div>
      <p className="form-note">
        Diagnoses and medicine names are typed by doctors and pharmacies, so the same thing written in different ways (&ldquo;Malaria&rdquo;,
        &ldquo;malaria.&rdquo;) is counted together, under its most common spelling. Hover over a bar for its share and the number of patients.
      </p>
    </div>
  );
}
