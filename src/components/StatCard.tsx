export default function StatCard({ label, value, icon }: { label: string; value: number | string; icon: string }) {
  return (
    <div className="stat">
      <div>
        <div className="stat-label">{label}</div>
        <div className={`stat-value${typeof value === "string" ? " stat-value-text" : ""}`}>{value}</div>
      </div>
      <div className="stat-icon">
        <i className={`fa-solid ${icon}`} />
      </div>
    </div>
  );
}
