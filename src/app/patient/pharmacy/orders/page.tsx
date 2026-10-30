import Link from "next/link";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { orderNumber } from "@/lib/pharmacy";
import { formatDate } from "@/components/appointments/shared";
import { ORDER_STATUS_CLASS, statusLabel } from "@/components/pharmacy/shared";

export const dynamic = "force-dynamic";

export default async function MyOrdersPage() {
  const patient = await requireUser(Role.PATIENT);
  const orders = await prisma.pharmacyOrder.findMany({
    where: { patientId: patient.id },
    include: { pharmacy: { select: { name: true } }, _count: { select: { items: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="settings">
      <Link href="/patient/pharmacy" className="back-link">
        <i className="fa-solid fa-arrow-left" /> Pharmacy
      </Link>
      <h2 className="section-heading">My Orders</h2>
      {orders.length === 0 ? (
        <div className="empty-banner">You haven&apos;t ordered anything yet.</div>
      ) : (
        <div className="card table-wrap">
          <table className="appt-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Pharmacy</th>
                <th>Date</th>
                <th className="num">Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/patient/pharmacy/orders/${o.id}`} className="table-link">
                      {orderNumber(o.number)}
                    </Link>
                    <br />
                    <span className="section-sub">
                      {o._count.items} item{o._count.items === 1 ? "" : "s"}
                    </span>
                  </td>
                  <td>{o.pharmacy.name}</td>
                  <td>{formatDate(o.createdAt.toISOString())}</td>
                  <td className="num">{formatMoney(o.total.toString())}</td>
                  <td>
                    <span className={`status-pill ${ORDER_STATUS_CLASS[o.status]}`}>{statusLabel(o.status, o.fulfilment)}</span>
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
