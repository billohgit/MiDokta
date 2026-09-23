export type MedicationRow = {
  id: string;
  name: string;
  strength: string | null;
  form: string | null;
  unit: string;
  quantity: number;
  reorderLevel: number;
  unitPrice: string | null;
  notes: string | null;
  isActive: boolean;
  /** Units dispensed to patients in the last 30 days — what the reorder level should be read against. */
  dispensed30d: number;
  lastReceivedAt: string | null;
};

export type MovementRow = {
  id: string;
  medication: string;
  type: "RECEIVED" | "DISPENSED" | "ADJUSTED";
  change: number;
  balance: number;
  note: string | null;
  recordedBy: string | null;
  createdAt: string;
};

/** What the pharmacist picks from when dispensing. */
export type MedicationOption = { id: string; name: string; strength: string | null; unit: string; quantity: number };

export const stockLevel = (m: { quantity: number; reorderLevel: number }) =>
  m.quantity === 0 ? "out" : m.quantity <= m.reorderLevel ? "low" : "ok";
