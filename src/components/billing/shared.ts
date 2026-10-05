import type { InvoiceStatus, PaymentMethod } from "@prisma/client";

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  UNPAID: "Unpaid",
  PARTIAL: "Partially paid",
  PAID: "Paid",
  VOID: "Void",
};

export const INVOICE_STATUS_CLASS: Record<InvoiceStatus, string> = {
  UNPAID: "status-rejected",
  PARTIAL: "status-pending",
  PAID: "status-confirmed",
  VOID: "status-void",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Cash",
  CARD: "Card",
  MOBILE_MONEY: "Mobile Money",
  BANK_TRANSFER: "Bank Transfer",
  INSURANCE: "Insurance",
  ONLINE: "Online (mobile money / card)",
};

/** Methods the front desk can record by hand; online payments are recorded by the checkout. */
export const MANUAL_PAYMENT_METHODS = (Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).filter((m) => m !== "ONLINE");

/** Suggested line items for the invoice form. */
export const COMMON_SERVICES = [
  "Consultation fee",
  "Follow-up consultation",
  "Laboratory test",
  "Blood test",
  "X-ray",
  "Ultrasound scan",
  "Medication",
  "Injection",
  "Wound dressing",
  "Admission (per day)",
];
