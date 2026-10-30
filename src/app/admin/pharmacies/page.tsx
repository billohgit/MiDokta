import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { ORDER_ROW_INCLUDE, toOrderRow } from "@/lib/pharmacy";
import PharmacyOrdersView from "@/components/pharmacy/PharmacyOrdersView";
import PharmacyToggle from "@/components/pharmacy/PharmacyToggle";

export const dynamic = "force-dynamic";

/** The pharmacies selling on MiDokta, the platform's earnings from them, and disputes to settle. */
export default async function AdminPharmaciesPage() {
  await requireUser(Role.ADMIN);
  const [pharmacies, disputed, totals, platform] = await Promise.all([
    prisma.pharmacy.findMany({
      include: {
        owner: { select: { firstName: true, lastName: true, phone: true } },
        _count: { select: { products: { where: { isActive: true } } } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.pharmacyOrder.findMany({ where: { status: "DISPUTED" }, include: ORDER_ROW_INCLUDE, orderBy: { updatedAt: "asc" } }),
    prisma.pharmacyOrder.groupBy({ by: ["pharmacyId"], where: { status: "RECEIVED" }, _sum: { total: true }, _count: true }),
    prisma.pharmacyOrder.aggregate({ where: { status: "RECEIVED" }, _sum: { platformFee: true } }),
  ]);
  const byPharmacy = new Map(totals.map((t) => [t.pharmacyId, t]));

  return (
    <div className="settings">
      <div className="appt-header">
        <div>
          <h2 className="section-heading">Pharmacies</h2>
          <p className="section-sub">
            {pharmacies.length} pharmac{pharmacies.length === 1 ? "y" : "ies"} · MiDokta platform fees from completed orders:{" "}
            {formatMoney((platform._sum.platformFee ?? new Prisma.Decimal(0)).toString())}
          </p>
        </div>
      </div>

      {disputed.length > 0 && (
        <>
          <h3 className="details-subhead">Disputed orders ({disputed.length})</h3>
          <p className="form-note">The patient says these never arrived. The money is held until you decide. Call both sides first.</p>
          <PharmacyOrdersView orders={disputed.map(toOrderRow)} as="admin" empty="" />
        </>
      )}

      {pharmacies.length === 0 ? (
        <div className="empty-banner">No pharmacies yet. Pharmacists set theirs up under My Pharmacy.</div>
      ) : (
        <div className="card table-wrap">
          <table className="appt-table">
            <thead>
              <tr>
                <th>Pharmacy</th>
                <th>Run by</th>
                <th className="num">Products</th>
                <th className="num">Completed orders</th>
                <th>Payout</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pharmacies.map((p) => {
                const t = byPharmacy.get(p.id);
                return (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      <br />
                      <span className="section-sub">
                        {p.address}
                        {p.city && `, ${p.city}`}
                      </span>
                    </td>
                    <td>
                      {p.owner.firstName} {p.owner.lastName}
                      <br />
                      <span className="section-sub">{p.phone ?? p.owner.phone ?? "—"}</span>
                    </td>
                    <td className="num">{p._count.products}</td>
                    <td className="num">
                      {t?._count ?? 0}
                      <br />
                      <span className="section-sub">{formatMoney((t?._sum.total ?? new Prisma.Decimal(0)).toString())}</span>
                    </td>
                    <td>{p.payoutWallet ? p.payoutAccount : <span className="status-pill status-pending">Not set</span>}</td>
                    <td className="row-actions">
                      <PharmacyToggle id={p.id} name={p.name} isActive={p.isActive} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
