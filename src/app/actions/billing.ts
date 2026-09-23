"use server";

import { revalidatePath } from "next/cache";
import { PaymentMethod, Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/auth";
import { PORTAL_TOKEN, notifyRoles } from "@/lib/notifications";
import { FRONT_DESK_ROLES } from "@/lib/roles";
import { queueSms } from "@/lib/sms";
import { sms } from "@/lib/sms/templates";
import { formatInvoiceNumber, formatMoney } from "@/lib/money";
import { type ActionResult, DENIED, dateValue, decimalValue, enumValue, fail, text } from "@/lib/form";

const refresh = () => revalidatePath("/", "layout");

const MAX_AMOUNT = 1_000_000_000;
const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

export async function createInvoice(formData: FormData): Promise<ActionResult> {
  if (!(await authorize(...FRONT_DESK_ROLES))) return DENIED;

  const patientId = text(formData, "patientId");
  const appointmentId = text(formData, "appointmentId");
  const dueDate = dateValue(formData, "dueDate");
  if (!patientId) return fail("Choose a patient.");
  if (dueDate === undefined) return fail("Enter a valid due date.");

  const patient = await prisma.user.findFirst({ where: { id: patientId, role: Role.PATIENT } });
  if (!patient) return fail("Patient not found.");

  let hospitalId: string | null = null;
  if (appointmentId) {
    const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appt || appt.patientId !== patientId) return fail("That appointment doesn't belong to this patient.");
    hospitalId = appt.hospitalId;
  }

  const descriptions = formData.getAll("itemDescription").map((v) => String(v).trim());
  const quantities = formData.getAll("itemQuantity").map((v) => String(v).trim());
  const prices = formData.getAll("itemUnitPrice").map((v) => String(v).trim());

  const items: { description: string; quantity: number; unitPrice: Prisma.Decimal }[] = [];
  for (let i = 0; i < descriptions.length; i++) {
    // Rows start with quantity 1, so a row is blank when it has no description and no price.
    if (!descriptions[i] && !prices[i]) continue;
    const quantity = Number(quantities[i]);
    if (!descriptions[i]) return fail(`Item ${i + 1}: description is required.`);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10_000) {
      return fail(`Item ${i + 1}: quantity must be a whole number from 1 to 10,000.`);
    }
    if (!MONEY_PATTERN.test(prices[i]) || Number(prices[i]) > MAX_AMOUNT) {
      return fail(`Item ${i + 1}: enter a valid unit price (up to 2 decimal places).`);
    }
    items.push({ description: descriptions[i], quantity, unitPrice: new Prisma.Decimal(prices[i]) });
  }
  if (items.length === 0) return fail("Add at least one item.");

  const total = items.reduce((sum, item) => sum.plus(item.unitPrice.times(item.quantity)), new Prisma.Decimal(0));

  const invoice = await prisma.invoice.create({
    data: {
      patientId,
      appointmentId,
      hospitalId,
      dueDate,
      notes: text(formData, "notes"),
      total,
      status: total.isZero() ? "PAID" : "UNPAID",
      items: { create: items },
    },
  });

  if (!total.isZero()) {
    await queueSms({
      userId: patientId,
      category: "INVOICE_CREATED",
      body: sms.invoiceCreated(patient, invoice.number, total.toString(), dueDate),
    });
  }

  refresh();
  return { ok: true, id: invoice.id };
}

export async function recordPayment(formData: FormData): Promise<ActionResult> {
  const user = await authorize(...FRONT_DESK_ROLES);
  if (!user) return DENIED;

  const invoiceId = text(formData, "invoiceId");
  const amount = decimalValue(formData, "amount", 0.01, MAX_AMOUNT);
  const method = enumValue(formData, "method", Object.values(PaymentMethod));
  if (!invoiceId) return fail("Invoice not found.");
  if (!amount || !MONEY_PATTERN.test(amount)) return fail("Enter a valid amount (up to 2 decimal places).");
  if (!method) return fail("Choose a payment method.");

  const result = await prisma.$transaction(async (tx) => {
    // Lock the invoice row so concurrent payments can't overpay it.
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId} FOR UPDATE`;
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      include: { patient: { select: { firstName: true, lastName: true } } },
    });
    if (!invoice) return { error: "Invoice not found." };
    if (invoice.status === "VOID") return { error: "This invoice has been voided." };

    const balance = invoice.total.minus(invoice.amountPaid);
    const paying = new Prisma.Decimal(amount);
    if (balance.lte(0)) return { error: "This invoice is already fully paid." };
    if (paying.gt(balance)) return { error: `Amount exceeds the balance of ${formatMoney(balance.toString())}.` };

    await tx.payment.create({
      data: { invoiceId, amount: paying, method, reference: text(formData, "reference"), receivedById: user.id },
    });
    const amountPaid = invoice.amountPaid.plus(paying);
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { amountPaid, status: amountPaid.gte(invoice.total) ? "PAID" : "PARTIAL" },
    });
    return { invoice, paying };
  });

  if (result.error !== undefined) return fail(result.error);

  await queueSms({
    userId: result.invoice.patientId,
    category: "PAYMENT_RECEIVED",
    body: sms.paymentReceived(
      result.invoice.patient,
      result.invoice.number,
      result.paying.toString(),
      Number(result.invoice.total.minus(result.invoice.amountPaid).minus(result.paying))
    ),
  });

  await notifyRoles(
    FRONT_DESK_ROLES,
    {
      type: "PAYMENT_RECEIVED",
      title: "Payment received",
      body: `${formatMoney(result.paying.toString())} for ${formatInvoiceNumber(result.invoice.number)} (${result.invoice.patient.firstName} ${result.invoice.patient.lastName})`,
      link: `${PORTAL_TOKEN}/billing/${invoiceId}`,
    },
    user.id
  );

  refresh();
  return { ok: true };
}

// Voiding stays with admins.
export async function voidInvoice(id: string): Promise<ActionResult> {
  if (!(await authorize(Role.ADMIN))) return DENIED;

  const invoice = await prisma.invoice.findUnique({ where: { id }, include: { _count: { select: { payments: true } } } });
  if (!invoice) return fail("Invoice not found.");
  if (invoice._count.payments > 0) return fail("Invoices with payments can't be voided.");

  await prisma.invoice.update({ where: { id }, data: { status: "VOID" } });
  refresh();
  return { ok: true };
}
