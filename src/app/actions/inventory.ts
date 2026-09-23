"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/auth";
import { type ActionResult, DENIED, decimalValue, fail, intValue, isUniqueViolation, text } from "@/lib/form";
import { StockError, alertIfLow, applyStockChange, medicationLabel } from "@/lib/stock";

const refresh = () => revalidatePath("/", "layout");

/** Pharmacists keep the catalogue; admins can too. */
const stockKeeper = () => authorize(Role.PHARMACIST, Role.ADMIN);

/** Turns a StockError into a form error and lets anything else surface as a crash. */
async function withStockErrors(work: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await work();
  } catch (e) {
    if (e instanceof StockError) return fail(e.message);
    throw e;
  }
}

export async function saveMedication(formData: FormData): Promise<ActionResult> {
  const user = await stockKeeper();
  if (!user) return DENIED;

  const id = text(formData, "id");
  const name = text(formData, "name");
  if (!name) return fail("Medication name is required.");

  const reorderLevel = intValue(formData, "reorderLevel", 0, 1_000_000);
  if (reorderLevel === undefined) return fail("Reorder level must be a whole number of units.");

  const unitPrice = decimalValue(formData, "unitPrice", 0, 10_000_000);
  if (unitPrice === undefined) return fail("Enter a valid unit price.");

  const data = {
    name,
    strength: text(formData, "strength"),
    form: text(formData, "form"),
    unit: text(formData, "unit") ?? "unit",
    reorderLevel: reorderLevel ?? 0,
    unitPrice,
    notes: text(formData, "notes"),
  };

  try {
    if (id) {
      const { count } = await prisma.medication.updateMany({ where: { id }, data });
      if (count === 0) return fail("Medication not found.");
    } else {
      // Opening stock goes through the ledger like any other delivery, so the
      // quantity on hand always has a movement behind it.
      const opening = intValue(formData, "quantity", 0, 1_000_000) ?? 0;
      const created = await prisma.medication.create({ data });
      if (opening > 0) {
        await prisma.$transaction((tx) =>
          applyStockChange(tx, {
            medicationId: created.id,
            change: opening,
            type: "RECEIVED",
            note: "Opening stock",
            recordedById: user.id,
          })
        );
      }
    }
  } catch (e) {
    if (isUniqueViolation(e)) return fail("That medication and strength is already in the catalogue.");
    throw e;
  }

  refresh();
  return { ok: true };
}

/** Records a delivery into stock. */
export async function receiveStock(formData: FormData): Promise<ActionResult> {
  const user = await stockKeeper();
  if (!user) return DENIED;

  const medicationId = text(formData, "medicationId");
  const quantity = intValue(formData, "quantity", 1, 1_000_000);
  if (!medicationId) return fail("Choose a medication.");
  if (!quantity) return fail("Enter how many units arrived.");

  return withStockErrors(async () => {
    await prisma.$transaction((tx) =>
      applyStockChange(tx, {
        medicationId,
        change: quantity,
        type: "RECEIVED",
        note: text(formData, "note"),
        recordedById: user.id,
      })
    );
    refresh();
    return { ok: true };
  });
}

/** Corrects the quantity on hand after a count, breakage or expiry. */
export async function adjustStock(formData: FormData): Promise<ActionResult> {
  const user = await stockKeeper();
  if (!user) return DENIED;

  const medicationId = text(formData, "medicationId");
  const counted = intValue(formData, "quantity", 0, 1_000_000);
  const note = text(formData, "note");
  if (!medicationId) return fail("Choose a medication.");
  if (counted === null || counted === undefined) return fail("Enter the quantity actually on hand.");
  if (!note) return fail("Say why the count is being corrected.");

  return withStockErrors(async () => {
    const medication = await prisma.medication.findUnique({ where: { id: medicationId } });
    if (!medication) return fail("Medication not found.");
    if (medication.quantity === counted) return fail("That is already the quantity on hand.");

    const updated = await prisma.$transaction((tx) =>
      applyStockChange(tx, {
        medicationId,
        change: counted - medication.quantity,
        type: "ADJUSTED",
        note,
        recordedById: user.id,
        expectedQuantity: medication.quantity,
      })
    );

    await alertIfLow(updated);
    refresh();
    return { ok: true };
  });
}

export async function setMedicationActive(id: string, isActive: boolean): Promise<ActionResult> {
  if (!(await stockKeeper())) return DENIED;
  const { count } = await prisma.medication.updateMany({ where: { id }, data: { isActive } });
  if (count === 0) return fail("Medication not found.");
  refresh();
  return { ok: true };
}

/** Only admins remove a medication, and only while nothing has been dispensed from it. */
export async function deleteMedication(id: string): Promise<ActionResult> {
  if (!(await authorize(Role.ADMIN))) return DENIED;

  const medication = await prisma.medication.findUnique({
    where: { id },
    include: { _count: { select: { prescriptions: true } } },
  });
  if (!medication) return fail("Medication not found.");
  if (medication._count.prescriptions > 0) {
    return fail(
      `${medicationLabel(medication)} has been dispensed to patients, so its history has to stay. Deactivate it instead.`
    );
  }

  await prisma.medication.delete({ where: { id } });
  refresh();
  return { ok: true };
}
