import "server-only";

import { createHmac, randomBytes } from "crypto";
import { Prisma, type CheckoutChannel, type CheckoutSession, type CheckoutStatus, type Invoice } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appBaseUrl } from "@/lib/url";
import { CURRENCY, formatInvoiceNumber, formatMoney } from "@/lib/money";
import { PORTAL_TOKEN, notifyRoles } from "@/lib/notifications";
import { FRONT_DESK_ROLES } from "@/lib/roles";
import { queueSms } from "@/lib/sms";
import { sms } from "@/lib/sms/templates";
import { onConsultationPaid } from "@/lib/consultations";
import { onPharmacyOrderPaid } from "@/lib/pharmacy";

/**
 * Online payments run on Monime (monime.io), whose hosted checkout takes mobile money (Orange Money,
 * Afrimoney), cards (Visa, Mastercard) and Sierra Leone banks, and on TenkiPay (tenkipay.com), whose
 * hosted checkout takes the TenkiPay wallet. Each invoice gets a private link (/pay/<key>); the patient
 * opens it, picks a method, and we send them to that provider's checkout. A Monime checkout offers only
 * the chosen method; Monime's digital wallets are always hidden. Each provider is offered only once
 * its keys are set.
 *
 * We never trust a redirect or a webhook body to say a payment happened: settling a checkout always
 * asks the provider for the session's status first.
 */

const API = "https://api.monime.io/v1";
const API_VERSION = "caph.2025-08-23";
/** One host for sandbox and live: the key prefix (pk_test_ / pk_live_) picks the environment. */
const TENKIPAY_API = (process.env.TENKIPAY_BASE_URL || "https://me.tenkipay.com").replace(/\/$/, "");
const TENKIPAY_SESSIONS = "/api/v1/merchant/checkout/sessions";
const TENKIPAY_ATTEMPTS = 3;
const tenkipayEnvironment = () => (process.env.TENKIPAY_PUBLIC_KEY?.startsWith("pk_live_") ? "live" : "test");

/** A pending checkout for the same amount is reused for this long, so reloads don't stack up sessions. */
const REUSE_CHECKOUT_MS = 20 * 60 * 1000;
/** Pending checkouts older than this are no longer checked by the scheduled job. */
const SYNC_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

const monimeConfigured = () => Boolean(process.env.MONIME_ACCESS_TOKEN && process.env.MONIME_SPACE_ID);
const tenkipayConfigured = () => Boolean(process.env.TENKIPAY_PUBLIC_KEY && process.env.TENKIPAY_SECRET_KEY);

/** The methods patients can pay with: Monime's three when it is set up, TenkiPay when it is. */
export const availableChannels = (): CheckoutChannel[] => [
  ...(monimeConfigured() ? (["MOBILE_MONEY", "CARD", "BANK"] as const) : []),
  ...(tenkipayConfigured() ? (["TENKIPAY"] as const) : []),
];

export const paymentsConfigured = () => availableChannels().length > 0;

type MonimeSession = {
  id: string;
  status: "pending" | "completed" | "cancelled" | "expired";
  redirectUrl: string;
  orderNumber?: string | null;
};

/** The provider answered and refused the request (4xx): sending the same request again won't help. */
export class ProviderRejected extends Error {}

export async function monime<T>(path: string, init: { method: "GET" | "POST"; body?: unknown; idempotencyKey?: string }): Promise<T> {
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
    const message = `Monime ${init.method} ${path} failed (${res.status}): ${detail.slice(0, 300)}`;
    throw res.status < 500 && res.status !== 429 ? new ProviderRejected(message) : new Error(message);
  }
  const json = (await res.json()) as { result: T };
  return json.result;
}

type TenkiPaySession = {
  session_id: string;
  checkout_url: string;
  status: "AUTH_PENDING" | "ACSC" | "RJCT" | "FAILED" | "EXPIRED" | "CANCELLED";
  merchant_reference: string;
  environment: "test" | "live";
  amount: string;
  currency: string;
  transaction_id?: string | null;
};

/**
 * A signed TenkiPay merchant API call: HMAC-SHA256 with the secret key over
 * "timestamp\nMETHOD\npath\nbody", where body is the exact JSON sent (empty for GET).
 *
 * A timeout, 409 (still processing), 429 or 5xx is retried with the same idempotency key and the same
 * body, as TenkiPay asks: a fresh key could open a second checkout for the same invoice.
 */
export async function tenkipay<T>(method: "GET" | "POST", path: string, payload?: unknown, idempotencyKey?: string): Promise<T> {
  const body = payload === undefined ? "" : JSON.stringify(payload);
  for (let attempt = 1; ; attempt++) {
    const retry = attempt < TENKIPAY_ATTEMPTS && (method === "GET" || Boolean(idempotencyKey));
    // Each attempt gets a fresh timestamp and signature; only the key and body stay the same.
    const timestamp = new Date().toISOString();
    const signature = createHmac("sha256", process.env.TENKIPAY_SECRET_KEY!).update([timestamp, method, path, body].join("\n"), "utf8").digest("hex");

    let res: Response;
    try {
      res = await fetch(`${TENKIPAY_API}${path}`, {
        method,
        headers: {
          Accept: "application/json",
          "X-TenkiPay-Key": process.env.TENKIPAY_PUBLIC_KEY!,
          "X-TenkiPay-Timestamp": timestamp,
          "X-TenkiPay-Signature": signature,
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        body: body || undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      if (!retry) throw e;
      await backoff(attempt);
      continue;
    }

    if (res.ok) return ((await res.json()) as { data: T }).data;
    if (retry && (res.status === 409 || res.status === 429 || res.status >= 500)) {
      await backoff(attempt);
      continue;
    }
    const detail = await res.text().catch(() => "");
    const message = `TenkiPay ${method} ${path} failed (${res.status}): ${detail.slice(0, 300)}`;
    throw res.status < 500 && res.status !== 429 ? new ProviderRejected(message) : new Error(message);
  }
}

/** About 1s, then 2s, with jitter. */
const backoff = (attempt: number) => new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1) * (0.75 + Math.random() / 2)));

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

/** Monime's name for each method in a checkout's `paymentOptions`. */
const MONIME_OPTION: Record<Exclude<CheckoutChannel, "TENKIPAY">, "momo" | "card" | "bank"> = {
  MOBILE_MONEY: "momo",
  CARD: "card",
  BANK: "bank",
};

/** Monime's `paymentOptions` for a checkout that offers only the chosen method; wallets are never offered. */
const paymentOptions = (channel: CheckoutChannel) => ({
  ...Object.fromEntries(Object.entries(MONIME_OPTION).map(([c, option]) => [option, { disable: c !== channel }])),
  wallet: { disable: true },
});

const CHANNEL_NAME: Record<CheckoutChannel, string> = {
  MOBILE_MONEY: "mobile money",
  CARD: "card",
  BANK: "bank transfer",
  TENKIPAY: "TenkiPay",
};

/** Monime prices are integers in minor units (cents of a Leone). */
export const toMinor = (amount: Prisma.Decimal) => amount.times(100).toDecimalPlaces(0).toNumber();

/**
 * Starts (or reuses) a checkout for the invoice's whole balance, offering only `channel`, and returns
 * the provider's page to send the patient to. The provider sends them back to `returnUrl` with
 * `?paid=1` or `?cancelled=1`.
 */
export async function startCheckout(invoice: Invoice, returnUrl: string, channel: CheckoutChannel): Promise<string> {
  const balance = invoice.total.minus(invoice.amountPaid);

  const recent = await prisma.checkoutSession.findFirst({
    where: { invoiceId: invoice.id, status: "PENDING", channel, amount: balance, createdAt: { gte: new Date(Date.now() - REUSE_CHECKOUT_MS) } },
    orderBy: { createdAt: "desc" },
  });
  if (recent) return recent.redirectUrl;

  // Chosen up front so TenkiPay can carry it as the checkout's merchant_reference.
  const id = randomBytes(12).toString("hex");
  const session = await createProviderCheckout(id, invoice, balance, returnUrl, channel);
  await prisma.checkoutSession.create({
    data: { id, invoiceId: invoice.id, sessionId: session.id, redirectUrl: session.redirectUrl, amount: balance, channel },
  });
  return session.redirectUrl;
}

async function createProviderCheckout(
  checkoutId: string,
  invoice: Invoice,
  balance: Prisma.Decimal,
  returnUrl: string,
  channel: CheckoutChannel,
): Promise<{ id: string; redirectUrl: string }> {
  const number = formatInvoiceNumber(invoice.number);
  const idempotencyKey = randomBytes(16).toString("hex");

  if (channel === "TENKIPAY") {
    const session = await tenkipay<TenkiPaySession>(
      "POST",
      TENKIPAY_SESSIONS,
      {
        merchant_reference: checkoutId,
        amount: balance.toFixed(2),
        currency: CURRENCY,
        description: `Payment for invoice ${number}`,
        success_url: `${returnUrl}?paid=1`,
        cancel_url: `${returnUrl}?cancelled=1`,
      },
      idempotencyKey,
    );
    return { id: session.session_id, redirectUrl: session.checkout_url };
  }

  const session = await monime<MonimeSession>("/checkout-sessions", {
    method: "POST",
    idempotencyKey,
    body: {
      name: `Invoice ${number}`,
      reference: invoice.id,
      description: `Payment for invoice ${number}`,
      successUrl: `${returnUrl}?paid=1`,
      cancelUrl: `${returnUrl}?cancelled=1`,
      lineItems: [{ type: "custom", name: `Invoice ${number}`, price: { currency: CURRENCY, value: toMinor(balance) }, quantity: 1 }],
      paymentOptions: paymentOptions(channel),
      brandingOptions: { primaryColor: "#b71c1c" },
      metadata: { invoiceId: invoice.id, channel },
    },
  });
  return { id: session.id, redirectUrl: session.redirectUrl };
}

const STATUS = { pending: "PENDING", completed: "COMPLETED", cancelled: "CANCELLED", expired: "EXPIRED" } as const;

/** TenkiPay's statuses; only ACSC means the money moved. */
const TENKIPAY_STATUS: Record<TenkiPaySession["status"], CheckoutStatus> = {
  AUTH_PENDING: "PENDING",
  ACSC: "COMPLETED",
  RJCT: "CANCELLED",
  FAILED: "CANCELLED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
};

/** Asks the checkout's provider how it ended, and the reference to record with the payment. */
async function fetchOutcome(checkout: CheckoutSession): Promise<{ status: CheckoutStatus | undefined; reference: string }> {
  const path = `/${encodeURIComponent(checkout.sessionId)}`;

  if (checkout.channel === "TENKIPAY") {
    const session = await tenkipay<TenkiPaySession>("GET", `${TENKIPAY_SESSIONS}${path}`);
    const status = TENKIPAY_STATUS[session.status];
    // TenkiPay asks merchants to check what was paid, and for which checkout, before treating ACSC as final.
    // A mismatch stays pending and is logged on every check, for staff to look into.
    if (
      status === "COMPLETED" &&
      (session.merchant_reference !== checkout.id ||
        session.environment !== tenkipayEnvironment() ||
        session.currency !== CURRENCY ||
        !new Prisma.Decimal(session.amount).equals(checkout.amount))
    ) {
      throw new Error(
        `TenkiPay session ${session.session_id} completed for ${session.amount} ${session.currency} (${session.environment}, ref ${session.merchant_reference}), ` +
          `expected ${checkout.amount} ${CURRENCY} (${tenkipayEnvironment()}, ref ${checkout.id})`,
      );
    }
    return { status, reference: session.transaction_id ?? session.session_id };
  }

  const session = await monime<MonimeSession>(`/checkout-sessions${path}`, { method: "GET" });
  return { status: STATUS[session.status], reference: session.orderNumber ?? session.id };
}

/**
 * Asks the provider how a checkout ended and, when it completed, records the payment on the invoice
 * exactly once. Safe to call any number of times, from any path (return page, webhook, cron).
 */
export async function settleCheckout(checkout: CheckoutSession): Promise<void> {
  if (checkout.status !== "PENDING") return;

  const { status, reference } = await fetchOutcome(checkout);
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
      data: { invoiceId: invoice.id, amount: fresh.amount, method: "ONLINE", reference },
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
  // A consultation booked with a fee reaches the doctor, and a pharmacy order the pharmacy, only once paid.
  if (!balance.isPositive()) {
    await onConsultationPaid(invoice.id, checkout.channel);
    await onPharmacyOrderPaid(invoice.id, checkout.channel);
  }
  const by = checkout.channel ? ` by ${CHANNEL_NAME[checkout.channel]}` : "";
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
    body: `${formatMoney(amount.toString())}${by} for ${number} (${invoice.patient.firstName} ${invoice.patient.lastName}).${issue}`,
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
