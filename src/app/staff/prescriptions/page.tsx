import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { medicationLabel, suggestMedicationId } from "@/lib/stock";
import PrescriptionsView from "@/components/prescriptions/PrescriptionsView";
import type { MedicationOption } from "@/components/inventory/types";
import type { PrescriptionRow } from "@/components/prescriptions/types";

export const dynamic = "force-dynamic";

/** Only the recent queue is loaded; older prescriptions stay on the patient's record. */
const TAKE = 300;

export default async function PrescriptionsPage() {
  await requireUser(Role.PHARMACIST);

  const [prescriptions, catalogue] = await Promise.all([
    prisma.prescription.findMany({
      orderBy: [{ dispensedAt: { sort: "asc", nulls: "first" } }, { record: { createdAt: "desc" } }],
      take: TAKE,
      include: {
        record: {
          select: {
            createdAt: true,
            patient: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, allergies: true } },
            doctor: { select: { firstName: true, lastName: true } },
          },
        },
        dispensedBy: { select: { firstName: true, lastName: true } },
        stockMedication: { select: { name: true, strength: true, unit: true } },
      },
    }),
    prisma.medication.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, strength: true, unit: true, quantity: true, isActive: true },
    }),
  ]);

  const rows: PrescriptionRow[] = prescriptions.map((p) => ({
    id: p.id,
    medication: p.medication,
    dosage: p.dosage,
    frequency: p.frequency,
    duration: p.duration,
    instructions: p.instructions,
    prescribedAt: p.record.createdAt.toISOString(),
    dispensedAt: p.dispensedAt?.toISOString() ?? null,
    dispensedBy: p.dispensedBy ? `${p.dispensedBy.firstName} ${p.dispensedBy.lastName}` : null,
    dispensedFrom:
      p.stockMedication && p.dispensedQuantity
        ? {
            medication: medicationLabel(p.stockMedication),
            quantity: p.dispensedQuantity,
            unit: p.stockMedication.unit,
          }
        : null,
    suggestedMedicationId: suggestMedicationId(p.medication, catalogue),
    patient: p.record.patient,
    doctor: `Dr. ${p.record.doctor.firstName} ${p.record.doctor.lastName}`,
  }));

  const medications: MedicationOption[] = catalogue.map(({ id, name, strength, unit, quantity }) => ({
    id,
    name,
    strength,
    unit,
    quantity,
  }));

  return <PrescriptionsView prescriptions={rows} medications={medications} />;
}
