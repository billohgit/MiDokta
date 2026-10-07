import "server-only";

import { randomBytes } from "crypto";
import { Prisma, type CheckoutSession, type Invoice } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appBaseUrl } from "@/lib/url";
import { CURRENCY, formatInvoiceNumber, formatMoney } from "@/lib/money";
import { PORTAL_TOKEN, notifyRoles } from "@/lib/notifications";
import { FRONT_DESK_ROLES } from "@/lib/roles";
import { queueSms } from "@/lib/sms";
import { sms } from "@/lib/sms/templates";

/**
 * Online payments run on Monime (monime.io), whose hosted checkout takes Orange Money, Afrimoney
 * and cards in Sierra Leone. Each invoice gets a private link (/pay/<key>); the patient opens it,
 * we create a checkout session for the balance and send them to Monime.
 *
 * We never trust a redirect or a webhook body to say a payment happened: settling a checkout always
 * asks Monime for the session's status first.
 */

const API = "https://api.monime.io/v1";
const API_VERSION = "caph.2025-08-23";

/** A pending checkout for the same amount is reused for this long, so reloads don't stack up sessions. */
const REUSE_CHECKOUT_MS = 20 * 60 * 1000;
/** Pending checkouts older than this are no longer checked by the scheduled job. */
const SYNC_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export const paymentsConfigured = () => Boolean(process.env.MONIME_ACCESS_TOKEN && process.env.MONIME_SPACE_ID);

type MonimeSession = {
  id: string;
  status: "pending" | "completed" | "cancelled" | "expired";
  redirectUrl: string;
  orderNumber?: string | null;
};

async function monime<T>(path: string, init: { method: "GET" | "POST"; body?: unknown; idempotencyKey?: string }): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${process.env.MONIME_ACCESS_TOKEN}`,
      "Monime-Space-Id": process.env.MONIME_SPACE_ID!,
      "Monime-Version": API_VERSION,
      "Content-Type": "application/json",
      ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Monime ${init.method} ${path} failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as { result: T };
  return json.result;
}

/** The invoice's payment link key, created on first use. */
export async function ensurePayKey(invoiceId: string): Promise<string> {
  const key = randomBytes(24).toString("base64url");
  await prisma.invoice.updateMany({ where: { id: invoiceId, payKey: null }, data: { payKey: key } });
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { payKey: true } });
  return invoice.payKey!;
}

export async function payLink(key: string): Promise<string> {
  return `${await appBaseUrl()}/pay/${key}`;
}

/** The invoice's payment link, or null when online payments aren't set up. */
export async function invoicePayLink(invoiceId: string): Promise<string | null> {
  return paymentsConfigured() ? payLink(await ensurePayKey(invoiceId)) : null;
}

/** Monime prices are integers in minor units (cents of a Leone). */
const toMinor = (amount: Prisma.Decimal) => amount.times(100).toDecimalPlaces(0).toNumber();

/**
 * Starts (or reuses) a checkout for the invoice's whole balance and returns the Monime page to send
 * the patient to. Monime sends them back to `returnUrl` with `?paid=1` or `?cancelled=1`.
 */
export async function startCheckout(invoice: Invoice, returnUrl: string): Promise<string> {
  const balance = invoice.total.minus(invoice.amountPaid);

  const recent = await prisma.checkoutSession.findFirst({
    where: { invoiceId: invoice.id, status: "PENDING", amount: balance, createdAt: { gte: new Date(Date.now() - REUSE_CHECKOUT_MS) } },
    orderBy: { createdAt: "desc" },
  });
  if (recent) return recent.redirectUrl;

  const number = formatInvoiceNumber(invoice.number);
  const session = await monime<MonimeSession>("/checkout-sessions", {
    method: "POST",
    idempotencyKey: randomBytes(16).toString("hex"),
    body: {
      name: `Invoice ${number}`,
      reference: invoice.id,
      description: `Payment for invoice ${number}`,
      successUrl: `${returnUrl}?paid=1`,
      cancelUrl: `${returnUrl}?cancelled=1`,
      lineItems: [{ name: `Invoice ${number}`, price: { currency: CURRENCY, value: toMinor(balance) }, quantity: 1 }],
      metadata: { invoiceId: invoice.id },
    },
  });

  await prisma.checkoutSession.create({
    data: { invoiceId: invoice.id, sessionId: session.id, redirectUrl: session.redirectUrl, amount: balance },
  });
  return session.redirectUrl;
}

const STATUS = { pending: "PENDING", completed: "COMPLETED", cancelled: "CANCELLED", expired: "EXPIRED" } as const;

/**
 * Asks Monime how a checkout ended and, when it completed, records the payment on the invoice
 * exactly once. Safe to call any number of times, from any path (return page, webhook, cron).
 */
export async function settleCheckout(checkout: CheckoutSession): Promise<void> {
  if (checkout.status !== "PENDING") return;

  const session = await monime<MonimeSession>(`/checkout-sessions/${encodeURIComponent(checkout.sessionId)}`, { method: "GET" });
  const status = STATUS[session.status];
  if (!status || status === "PENDING") return;

  if (status !== "COMPLETED") {
    await prisma.checkoutSession.updateMany({ where: { id: checkout.id, status: "PENDING" }, data: { status } });
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    // Lock the checkout, then the invoice, so concurrent settles and front-desk payments can't double-count.
    await tx.$queryRaw`SELECT id FROM "CheckoutSession" WHERE id = ${checkout.id} FOR UPDATE`;
    const fresh = await tx.checkoutSession.findUnique({ where: { id: checkout.id } });
    if (!fresh || fresh.status !== "PENDING") return null;

    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${checkout.invoiceId} FOR UPDATE`;
    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id: checkout.invoiceId },
      include: { patient: { select: { firstName: true, lastName: true } } },
    });

    // The money has moved, so the payment is recorded in full even if the balance changed meanwhile.
    const payment = await tx.payment.create({
      data: { invoiceId: invoice.id, amount: fresh.amount, method: "ONLINE", reference: session.orderNumber ?? session.id },
    });
    await tx.checkoutSession.update({ where: { id: fresh.id }, data: { status: "COMPLETED", paymentId: payment.id } });

    const amountPaid = invoice.amountPaid.plus(fresh.amount);
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        amountPaid,
        // A voided invoice stays void; staff are told below so they can refund or reinstate it.
        ...(invoice.status === "VOID" ? {} : { status: amountPaid.gte(invoice.total) ? "PAID" : "PARTIAL" }),
      },
    });
    return { invoice, amount: fresh.amount, balance: invoice.total.minus(amountPaid) };
  });
  if (!result) return;

  const { invoice, amount, balance } = result;
  const number = formatInvoiceNumber(invoice.number);
  await queueSms({
    userId: invoice.patientId,
    category: "PAYMENT_RECEIVED",
    body: sms.paymentReceived(invoice.patient, invoice.number, amount.toString(), Math.max(0, balance.toNumber())),
  });

  const issue =
    invoice.status === "VOID" ? " The invoice was void: check whether to refund." : balance.isNegative() ? ` Overpaid by ${formatMoney(balance.negated().toString())}.` : "";
  await notifyRoles(FRONT_DESK_ROLES, {
    type: "PAYMENT_RECEIVED",
    title: "Online payment received",
    body: `${formatMoney(amount.toString())} for ${number} (${invoice.patient.firstName} ${invoice.patient.lastName}).${issue}`,
    link: `${PORTAL_TOKEN}/billing/${invoice.id}`,
  });
}

/** Settles every pending checkout of one invoice. Errors are logged, never thrown, so pages still render. */
export async function syncInvoiceCheckouts(invoiceId: string): Promise<void> {
  if (!paymentsConfigured()) return;
  const pending = await prisma.checkoutSession.findMany({ where: { invoiceId, status: "PENDING" } });
  await settleAll(pending);
}

/** Settles recent pending checkouts across all invoices; run from the scheduled job as a backstop. */
export async function syncPendingCheckouts(): Promise<{ checked: number }> {
  if (!paymentsConfigured()) return { checked: 0 };
  const pending = await prisma.checkoutSession.findMany({
    where: { status: "PENDING", createdAt: { gte: new Date(Date.now() - SYNC_WINDOW_MS) } },
    take: 100,
  });
  await settleAll(pending);
  return { checked: pending.length };
}

async function settleAll(checkouts: CheckoutSession[]) {
  for (const c of checkouts) {
    try {
      await settleCheckout(c);
    } catch (e) {
      console.error(`Settling checkout ${c.id} failed`, e);
    }
  }
}
