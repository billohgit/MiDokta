export type PrescriptionRow = {
  id: string;
  medication: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string | null;
  /** When the consultation that prescribed this was written. */
  prescribedAt: string;
  dispensedAt: string | null;
  dispensedBy: string | null;
  /** The stock item handed over, once dispensed. Null when the pharmacy doesn't stock it. */
  dispensedFrom: { medication: string; quantity: number; unit: string } | null;
  /** The stock item whose name matches what the doctor wrote, pre-selected when dispensing. */
  suggestedMedicationId: string | null;
  patient: { id: string; firstName: string; lastName: string; avatarUrl: string | null; allergies: string | null };
  doctor: string;
};
