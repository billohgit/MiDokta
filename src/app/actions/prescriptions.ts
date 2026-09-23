"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/auth";
import { type ActionResult, DENIED, fail, intValue, text } from "@/lib/form";
import { StockError, alertIfLow, applyStockChange } from "@/lib/stock";

const refresh = () => revalidatePath("/", "layout");

/**
 * Pharmacists record handing a medication over. When they name a stock item, that
 * many units come out of stock in the same transaction, so the queue and the shelf
 * can't disagree. Leaving it blank still dispenses — not everything is stocked here.
 */
export async function dispensePrescription(formData: FormData): Promise<ActionResult> {
  const user = await authorize(Role.PHARMACIST, Role.ADMIN);
  if (!user) return DENIED;

  const id = text(formData, "id");
  if (!id) return fail("Prescription not found.");

  const medicationId = text(formData, "medicationId");
  const quantity = intValue(formData, "quantity", 1, 100_000);
  if (medicationId && !quantity) return fail("Enter how many units are being handed over.");

  const prescription = await prisma.prescription.findUnique({ where: { id } });
  if (!prescription) return fail("Prescription not found.");
  if (prescription.dispensedAt) return fail("That prescription has already been dispensed.");

  try {
    const medication = await prisma.$transaction(async (tx) => {
      await tx.prescription.update({
        where: { id },
        data: {
          dispensedAt: new Date(),
          dispensedById: user.id,
          medicationId,
          dispensedQuantity: medicationId ? quantity : null,
        },
      });

      if (!medicationId || !quantity) return null;
      return applyStockChange(tx, {
        medicationId,
        change: -quantity,
        type: "DISPENSED",
        note: `Dispensed to patient · ${prescription.medication}`,
        prescriptionId: id,
        recordedById: user.id,
      });
    });

    if (medication) await alertIfLow(medication);
  } catch (e) {
    if (e instanceof StockError) return fail(e.message);
    throw e;
  }

  refresh();
  return { ok: true };
}

/**
 * Undoes a dispense that shouldn't have been recorded. Anything taken from stock goes
 * back as its own ledger entry rather than by deleting the original, so the shelf
 * history stays readable.
 */
export async function undoDispense(id: string): Promise<ActionResult> {
  const user = await authorize(Role.PHARMACIST, Role.ADMIN);
  if (!user) return DENIED;

  const prescription = await prisma.prescription.findUnique({ where: { id } });
  if (!prescription) return fail("Prescription not found.");
  if (!prescription.dispensedAt) return fail("That prescription has not been dispensed.");

  const { medicationId, dispensedQuantity } = prescription;

  await prisma.$transaction(async (tx) => {
    await tx.prescription.update({
      where: { id },
      data: { dispensedAt: null, dispensedById: null, medicationId: null, dispensedQuantity: null },
    });

    if (medicationId && dispensedQuantity) {
      await applyStockChange(tx, {
        medicationId,
        change: dispensedQuantity,
        type: "ADJUSTED",
        note: `Dispense reversed · ${prescription.medication}`,
        prescriptionId: id,
        recordedById: user.id,
      });
    }
  });

  refresh();
  return { ok: true };
}
