import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { medicationLabel } from "@/lib/stock";
import StatCard from "@/components/StatCard";
import InventoryView from "./InventoryView";
import { type MedicationRow, type MovementRow, stockLevel } from "./types";

/** Only the recent ledger is shown; the full history stays in the database. */
const MOVEMENTS = 40;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** The pharmacy stock list, shared by the pharmacist and admin portals. */
export default async function InventoryPage({ canDelete }: { canDelete: boolean }) {
  const since = new Date(Date.now() - THIRTY_DAYS_MS);

  const [medications, movements, dispensed, lastDeliveries] = await Promise.all([
    prisma.medication.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
    prisma.stockMovement.findMany({
      orderBy: { createdAt: "desc" },
      take: MOVEMENTS,
      include: {
        medication: { select: { name: true, strength: true } },
        recordedBy: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.stockMovement.groupBy({
      by: ["medicationId"],
      where: { type: "DISPENSED", createdAt: { gte: since } },
      _sum: { change: true },
    }),
    prisma.stockMovement.groupBy({
      by: ["medicationId"],
      where: { type: "RECEIVED" },
      _max: { createdAt: true },
    }),
  ]);

  const rows: MedicationRow[] = medications.map((m) => ({
    id: m.id,
    name: m.name,
    strength: m.strength,
    form: m.form,
    unit: m.unit,
    quantity: m.quantity,
    reorderLevel: m.reorderLevel,
    unitPrice: m.unitPrice?.toString() ?? null,
    notes: m.notes,
    isActive: m.isActive,
    // Dispensing movements are negative, so the total comes back as units used.
    dispensed30d: -(dispensed.find((d) => d.medicationId === m.id)?._sum.change ?? 0),
    lastReceivedAt: lastDeliveries.find((d) => d.medicationId === m.id)?._max.createdAt?.toISOString() ?? null,
  }));

  const ledger: MovementRow[] = movements.map((mv) => ({
    id: mv.id,
    medication: medicationLabel(mv.medication),
    type: mv.type,
    change: mv.change,
    balance: mv.balance,
    note: mv.note,
    recordedBy: mv.recordedBy ? `${mv.recordedBy.firstName} ${mv.recordedBy.lastName}` : null,
    createdAt: mv.createdAt.toISOString(),
  }));

  const active = rows.filter((m) => m.isActive);
  const needsReorder = active.filter((m) => stockLevel(m) !== "ok").length;
  const stockValue = active.reduce((sum, m) => sum + Number(m.unitPrice ?? 0) * m.quantity, 0);
  const dispensed30d = rows.reduce((sum, m) => sum + m.dispensed30d, 0);

  return (
    <>
      <section className="stats">
        <StatCard label="Medications" value={active.length} icon="fa-pills" />
        <StatCard label="Needs Reordering" value={needsReorder} icon="fa-triangle-exclamation" />
        <StatCard label="Dispensed (30d)" value={dispensed30d} icon="fa-hand-holding-medical" />
        <StatCard label="Stock Value" value={formatMoney(stockValue)} icon="fa-sack-dollar" />
      </section>

      <InventoryView medications={rows} movements={ledger} canDelete={canDelete} />
    </>
  );
}
