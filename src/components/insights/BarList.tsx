import type { Ranked } from "@/lib/insights";

type Props = {
  title: string;
  subtitle: string;
  rows: Ranked[];
  /** What one count is, e.g. "visit" or "unit". */
  unit: string;
  /** Everything counted in the period (not just the top rows), for each row's share. */
  total: number;
  empty: string;
};

const plural = (n: number, unit: string) => `${n.toLocaleString()} ${unit}${n === 1 ? "" : "s"}`;

/**
 * A ranked horizontal bar chart: one series, so no legend (the title names it). Bars grow from one
 * baseline with the value at the tip; hovering or focusing a bar shows its count, share and patients.
 * The names and values are printed in full, so the chart doubles as its own table.
 */
export default function BarList({ title, subtitle, rows, unit, total, empty }: Props) {
  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <section className="card insight-card">
      <h3 className="insight-title">{title}</h3>
      <p className="section-sub">{subtitle}</p>
      {rows.length === 0 ? (
        <p className="insight-empty">{empty}</p>
      ) : (
        <ol className="bar-list">
          {rows.map((r, i) => {
            const detail = `${r.label}: ${plural(r.count, unit)}${r.patients !== undefined ? `, ${plural(r.patients, "patient")}` : ""} (${Math.round((r.count / Math.max(1, total)) * 100)}% of all)`;
            return (
              <li key={r.label} className="bar-row" tabIndex={0} aria-label={detail} data-tip={detail}>
                <span className="bar-rank">{i + 1}</span>
                <span className="bar-label">{r.label}</span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ width: `calc((100% - 64px) * ${r.count / max})` }} />
                  <span className="bar-value">{r.count.toLocaleString()}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
