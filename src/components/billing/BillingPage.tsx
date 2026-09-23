import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import StatCard from "@/components/StatCard";
import InvoicesView, { type InvoiceRow } from "./InvoicesView";

/** Invoice list and totals, shared by the admin and receptionist portals. */
export default async function BillingPage({ basePath }: { basePath: string }) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [invoices, billed, collectedThisMonth] = await Promise.all([
    prisma.invoice.findMany({
      orderBy: { createdAt: "desc" },
      include: { patient: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
    }),
    prisma.invoice.aggregate({ where: { status: { not: "VOID" } }, _sum: { total: true, amountPaid: true } }),
    prisma.payment.aggregate({ where: { paidAt: { gte: monthStart } }, _sum: { amount: true } }),
  ]);

  const totalBilled = Number(billed._sum.total ?? 0);
  const totalPaid = Number(billed._sum.amountPaid ?? 0);

  const rows: InvoiceRow[] = invoices.map((i) => ({
    id: i.id,
    number: i.number,
    patient: i.patient,
    createdAt: i.createdAt.toISOString(),
    dueDate: i.dueDate?.toISOString().slice(0, 10) ?? null,
    total: Number(i.total),
    amountPaid: Number(i.amountPaid),
    status: i.status,
  }));

  return (
    <>
      <section className="stats">
        <StatCard label="Total Billed" value={formatMoney(totalBilled)} icon="fa-file-invoice" />
        <StatCard label="Collected" value={formatMoney(totalPaid)} icon="fa-sack-dollar" />
        <StatCard label="Outstanding" value={formatMoney(totalBilled - totalPaid)} icon="fa-hourglass-half" />
        <StatCard label="This Month" value={formatMoney(Number(collectedThisMonth._sum.amount ?? 0))} icon="fa-chart-line" />
      </section>
      <InvoicesView invoices={rows} basePath={basePath} />
    </>
  );
}
