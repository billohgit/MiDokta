"use server";

import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/auth";
import { FRONT_DESK_ROLES } from "@/lib/roles";
import { type ActionResult, DENIED, fail } from "@/lib/form";
import { queueSms } from "@/lib/sms";
import { sms } from "@/lib/sms/templates";
import { appBaseUrl } from "@/lib/url";
import { ensurePayKey, payLink, paymentsConfigured, startCheckout, syncInvoiceCheckouts } from "@/lib/payments";

const NOT_SET_UP = "Online payments aren't set up yet. Add MONIME_ACCESS_TOKEN and MONIME_SPACE_ID to the server settings.";

/** Texts the patient a link to pay the invoice's balance online. */
export async function textPaymentLink(invoiceId: string): Promise<ActionResult> {
  const me = await authorize(...FRONT_DESK_ROLES);
  if (!me) return DENIED;
  if (!paymentsConfigured()) return fail(NOT_SET_UP);

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { patient: true } });
  if (!invoice) return fail("Invoice not found.");
  if (invoice.status !== "UNPAID" && invoice.status !== "PARTIAL") return fail("This invoice has nothing left to pay.");

  const link = await payLink(await ensurePayKey(invoice.id));
  const balance = invoice.total.minus(invoice.amountPaid).toString();
  const { queued } = await queueSms({
    userId: invoice.patientId,
    category: "INVOICE_CREATED",
    body: sms.paymentLink(invoice.patient, invoice.number, balance, link),
    sentById: me.id,
  });
  if (!queued) return fail("The text couldn't be sent: the patient has no valid phone number or has turned off texts. Copy the link instead.");
  return { ok: true };
}

/**
 * Public: called from the patient's payment page (/pay/<key>), where the key is the only credential.
 * Returns the Monime checkout page to send the patient to.
 */
export async function payInvoiceOnline(key: string): Promise<ActionResult & { url?: string }> {
  if (!paymentsConfigured()) return fail("Online payment isn't available right now. Please pay at the clinic.");
  const invoice = await prisma.invoice.findUnique({ where: { payKey: key } });
  if (!invoice?.payKey) return fail("This payment link isn't valid.");

  // A payment may have just completed in another tab; don't start a second one for the same balance.
  await syncInvoiceCheckouts(invoice.id);
  const fresh = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  if (fresh.status !== "UNPAID" && fresh.status !== "PARTIAL") return fail("This invoice has nothing left to pay.");

  try {
    return { ok: true, url: await startCheckout(fresh, await payLink(invoice.payKey)) };
  } catch (e) {
    console.error("Starting checkout failed", e);
    return fail("We couldn't start the payment. Please try again in a moment.");
  }
}

/** A signed-in patient pays their own invoice; Monime sends them back to the invoice in their portal. */
export async function payMyInvoice(invoiceId: string): Promise<ActionResult & { url?: string }> {
  const me = await authorize(Role.PATIENT);
  if (!me) return DENIED;
  if (!paymentsConfigured()) return fail("Online payment isn't available right now. Please pay at the clinic.");
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, patientId: me.id } });
  if (!invoice) return fail("Invoice not found.");

  await syncInvoiceCheckouts(invoice.id);
  const fresh = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  if (fresh.status !== "UNPAID" && fresh.status !== "PARTIAL") return fail("This invoice has nothing left to pay.");

  try {
    return { ok: true, url: await startCheckout(fresh, `${await appBaseUrl()}/patient/billing/${invoice.id}`) };
  } catch (e) {
    console.error("Starting checkout failed", e);
    return fail("We couldn't start the payment. Please try again in a moment.");
  }
}
