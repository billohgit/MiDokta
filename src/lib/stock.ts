import "server-only";

import { type Prisma, Role, type StockMovementType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PORTAL_TOKEN, notifyRolesOnce } from "@/lib/notifications";

/** Thrown for problems the pharmacist can fix, e.g. not enough stock. Actions turn these into form errors. */
export class StockError extends Error {}

/** Matches medications whose stock has fallen to or below their reorder level. */
export const LOW_STOCK_WHERE = {
  isActive: true,
  quantity: { lte: prisma.medication.fields.reorderLevel },
} satisfies Prisma.MedicationWhereInput;

export const lowStockCount = () => prisma.medication.count({ where: LOW_STOCK_WHERE });

/** How a medication reads in a sentence: "Amoxicillin 500mg". */
export const medicationLabel = (m: { name: string; strength: string | null }) =>
  [m.name, m.strength].filter(Boolean).join(" ");

type StockChange = {
  medicationId: string;
  /** Signed: positive adds to stock, negative takes from it. */
  change: number;
  type: StockMovementType;
  note?: string | null;
  prescriptionId?: string | null;
  recordedById?: string | null;
  /**
   * The quantity the caller believes is on hand. When given, the change only applies
   * if that is still true, so two people counting at once can't overwrite each other.
   */
  expectedQuantity?: number;
};

/**
 * Applies a stock change and records it in the ledger, inside the caller's transaction.
 * Stock is never allowed to go negative.
 */
export async function applyStockChange(tx: Prisma.TransactionClient, change: StockChange) {
  const medication = await tx.medication.findUnique({ where: { id: change.medicationId } });
  if (!medication) throw new StockError("That medication is no longer in the catalogue.");

  const balance = medication.quantity + change.change;
  if (balance < 0) {
    throw new StockError(
      `Only ${medication.quantity} ${medication.unit}${medication.quantity === 1 ? "" : "s"} of ` +
        `${medicationLabel(medication)} left in stock.`
    );
  }

  // Guarded update: if the quantity moved since it was read, nothing is written.
  const { count } = await tx.medication.updateMany({
    where: { id: medication.id, quantity: change.expectedQuantity ?? medication.quantity },
    data: { quantity: balance },
  });
  if (count === 0) throw new StockError("Stock changed while you were working. Reload and try again.");

  await tx.stockMovement.create({
    data: {
      medicationId: medication.id,
      type: change.type,
      change: change.change,
      balance,
      note: change.note ?? null,
      prescriptionId: change.prescriptionId ?? null,
      recordedById: change.recordedById ?? null,
    },
  });

  return { ...medication, quantity: balance };
}

/**
 * Alerts pharmacists and admins when a medication has run low, at most once a day
 * for each level so a busy dispensing round doesn't flood the bell.
 */
export async function alertIfLow(medication: { id: string; name: string; strength: string | null; unit: string; quantity: number; reorderLevel: number }) {
  if (medication.quantity > medication.reorderLevel) return;

  const out = medication.quantity === 0;
  const label = medicationLabel(medication);
  const today = new Date().toISOString().slice(0, 10);

  await notifyRolesOnce(
    [Role.PHARMACIST, Role.ADMIN],
    {
      type: "STOCK_LOW",
      title: out ? `${label} is out of stock` : `${label} is running low`,
      body: out
        ? "None left to dispense. Record a delivery to restock."
        : `${medication.quantity} ${medication.unit}${medication.quantity === 1 ? "" : "s"} left · reorder at ${medication.reorderLevel}.`,
      link: `${PORTAL_TOKEN}/inventory`,
    },
    `stock:${medication.id}:${out ? "out" : "low"}:${today}`
  );
}

/**
 * Best guess at which stock item a doctor's free-text prescription refers to, so the
 * pharmacist usually just confirms rather than searching. Matches on the medication
 * name appearing in either direction, e.g. "Amoxicillin" for "Amoxicillin 500mg caps".
 */
export function suggestMedicationId(
  written: string,
  catalogue: { id: string; name: string; isActive: boolean }[]
): string | null {
  const text = written.trim().toLowerCase();
  if (!text) return null;
  const match = catalogue.find(
    (m) => m.isActive && (text.includes(m.name.toLowerCase()) || m.name.toLowerCase().includes(text))
  );
  return match?.id ?? null;
}
