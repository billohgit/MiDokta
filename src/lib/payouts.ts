import "server-only";

import { Prisma, Role, type CheckoutChannel, type MobileWallet, type Payout, type PayoutKind, type PayoutStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CURRENCY, formatMoney } from "@/lib/money";
import { ProviderRejected, availableChannels, monime, tenkipay, toMinor } from "@/lib/payments";
import { PORTAL_TOKEN, notifyRoles, notifyUsers } from "@/lib/notifications";
import { isUniqueViolation } from "@/lib/form";
import { queueSms } from "@/lib/sms";
import { SMS_BRAND } from "@/lib/sms/templates";
import { normalizePhone } from "@/lib/sms/phone";
import { formatDate } from "@/components/appointments/shared";

/**
 * Money sent out of the platform's account: a doctor's share of a consultation fee, a pharmacy's
 * share of an order, or a refund to the patient. Money always leaves through the provider it came in
 * through (Monime, or TenkiPay for TenkiPay payments). Each payout's own id is its idempotency key, so
 * retrying one can never send the money twice.
 */

/** The platform's share of what patients pay (consultation fees, and the medicines in an order). */
export const PLATFORM_FEE_RATE = new Prisma.Decimal("0.10");

export const platformFeeOf = (amount: Prisma.Decimal) => amount.times(PLATFORM_FEE_RATE).toDecimalPlaces(2);

export const WALLET_LABEL: Record<MobileWallet, string> = {
  ORANGE_MONEY: "Orange Money",
  AFRIMONEY: "Afrimoney",
  QMONEY: "QMoney",
  TENKIPAY: "TenkiPay wallet",
};

/** Monime's provider ids for the wallets it can pay out to (from GET /v1/momos). */
const MONIME_PROVIDER: Partial<Record<MobileWallet, string>> = { ORANGE_MONEY: "m17", AFRIMONEY: "m18" };
/** TenkiPay's transfer destination types. */
const TENKIPAY_DESTINATION: Partial<Record<MobileWallet, string>> = { ORANGE_MONEY: "ORANGE_MONEY", QMONEY: "QMONEY", TENKIPAY: "TENKIPAY" };

const canPayTo = (viaTenkipay: boolean, wallet: MobileWallet) => Boolean((viaTenkipay ? TENKIPAY_DESTINATION : MONIME_PROVIDER)[wallet]);
const providerName = (viaTenkipay: boolean) => (viaTenkipay ? "TenkiPay" : "Monime");

/** Payment methods whose provider can refund to `wallet`, so a refund can never get stuck. */
export const channelsRefundableTo = (wallet: MobileWallet) => availableChannels().filter((c) => canPayTo(c === "TENKIPAY", wallet));

/**
 * The account to send money to, cleaned up: a Sierra Leone mobile number in +232 form, or for a
 * TenkiPay wallet, the wallet number as given. Null if it isn't valid.
 */
export function walletAccount(wallet: MobileWallet, raw: string | null): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (wallet === "TENKIPAY") return /^[A-Za-z0-9+._-]{3,60}$/.test(value) ? value : null;
  const phone = normalizePhone(value, "232");
  return phone?.startsWith("+232") ? phone : null;
}

/** The payment methods offered for an invoice: for a consultation fee or an order, only those that can refund it. */
export async function channelsForInvoice(invoiceId: string): Promise<CheckoutChannel[]> {
  const [c, o] = await Promise.all([
    prisma.consultation.findUnique({ where: { invoiceId }, select: { refundWallet: true } }),
    prisma.pharmacyOrder.findUnique({ where: { invoiceId }, select: { refundWallet: true } }),
  ]);
  const wallet = c?.refundWallet ?? o?.refundWallet;
  return wallet ? channelsRefundableTo(wallet) : availableChannels();
}

/** Why the invoice can't be paid online right now, or null if it can. */
export async function invoicePayProblem(invoiceId: string): Promise<string | null> {
  const [c, o] = await Promise.all([
    prisma.consultation.findUnique({ where: { invoiceId }, select: { startsAt: true, paidAt: true } }),
    prisma.pharmacyOrder.findUnique({ where: { invoiceId }, select: { status: true, items: { select: { quantity: true, product: true } } } }),
  ]);
  if (c && !c.paidAt && c.startsAt.getTime() < Date.now()) return "The time you booked has passed. Please book a new time.";
  if (o && o.status !== "AWAITING_PAYMENT") return o.status === "CANCELLED" ? "This order was cancelled." : null;
  if (o?.items.some((i) => !i.product?.isActive || i.product.quantity < i.quantity)) {
    return "Some items in this order have sold out. Cancel it and order again from your cart.";
  }
  return null;
}

type NewPayout = {
  consultationId?: string;
  orderId?: string;
  kind: PayoutKind;
  recipientId: string;
  amount: Prisma.Decimal;
  paidVia: CheckoutChannel | null;
  wallet: MobileWallet | null;
  account: string | null;
};

/**
 * Starts a payout, at most once per consultation or order and kind. Returns "waiting" when the
 * recipient has no payout account yet (the caller tells them to add one), "exists" when it was
 * already started, and otherwise sends it.
 */
export async function startPayout(n: NewPayout): Promise<"sent" | "waiting" | "exists"> {
  const destination = n.wallet && n.account ? { wallet: n.wallet, account: n.account } : { wallet: null, account: null };
  let payout: Payout;
  try {
    payout = await prisma.payout.create({
      data: {
        consultationId: n.consultationId,
        orderId: n.orderId,
        kind: n.kind,
        recipientId: n.recipientId,
        amount: n.amount,
        viaTenkipay: n.paidVia === "TENKIPAY",
        ...destination,
        failureReason: destination.wallet ? null : "Waiting for a payout number.",
      },
    });
  } catch (e) {
    if (isUniqueViolation(e)) return "exists"; // started by a concurrent request
    throw e;
  }
  if (!payout.wallet) return "waiting";
  await sendPayout(payout);
  return "sent";
}

/** A recipient added a payout account: send what was waiting for one. */
export async function sendWaitingPayouts(recipientId: string, kind: PayoutKind, wallet: MobileWallet | null, account: string | null): Promise<void> {
  if (!wallet || !account) return;
  await prisma.payout.updateMany({
    where: { recipientId, kind, status: "PENDING", wallet: null },
    data: { wallet, account, failureReason: null },
  });
  const ready = await prisma.payout.findMany({ where: { recipientId, kind, status: "PENDING", providerId: null, wallet: { not: null } } });
  for (const p of ready) await sendPayout(p);
}

type Sent = { id: string; status: PayoutStatus; failure?: string | null };

/**
 * Asks the provider to send a pending payout. A refusal from the provider fails the payout and alerts
 * admins; a network error leaves it pending for the scheduled job to try again with the same key.
 */
async function sendPayout(p: Payout): Promise<void> {
  if (p.status !== "PENDING" || !p.wallet || !p.account) return;
  if (!canPayTo(p.viaTenkipay, p.wallet)) {
    await settle(p, { id: p.providerId ?? "", status: "FAILED", failure: `${providerName(p.viaTenkipay)} can't send money to ${WALLET_LABEL[p.wallet]}.` });
    return;
  }
  try {
    await settle(p, p.viaTenkipay ? await sendViaTenkipay(p) : await sendViaMonime(p));
  } catch (e) {
    if (e instanceof ProviderRejected) {
      await settle(p, { id: "", status: "FAILED", failure: e.message.slice(0, 300) });
    } else {
      console.error(`Sending payout ${p.id} failed; will retry`, e);
    }
  }
}

type MonimePayout = { id: string; status: "pending" | "processing" | "completed" | "failed"; failureDetail?: { message?: string } | null };
const MONIME_PAYOUT_STATUS: Record<MonimePayout["status"], PayoutStatus> = {
  pending: "PROCESSING",
  processing: "PROCESSING",
  completed: "COMPLETED",
  failed: "FAILED",
};

async function sendViaMonime(p: Payout): Promise<Sent> {
  const payout = await monime<MonimePayout>("/payouts", {
    method: "POST",
    idempotencyKey: p.id,
    body: {
      amount: { currency: CURRENCY, value: toMinor(p.amount) },
      destination: { type: "momo", providerId: MONIME_PROVIDER[p.wallet!], phoneNumber: p.account },
      metadata: { payoutId: p.id, kind: p.kind },
    },
  });
  return { id: payout.id, status: MONIME_PAYOUT_STATUS[payout.status], failure: payout.failureDetail?.message };
}

type TenkiPayTransfer = { id: string; status: "QUEUED" | "PROCESSING" | "READY_FOR_PICKUP" | "COMPLETED" | "FAILED" | "REVERSED"; failure_reason?: string | null };
const TENKIPAY_TRANSFER_STATUS: Record<TenkiPayTransfer["status"], PayoutStatus> = {
  QUEUED: "PROCESSING",
  PROCESSING: "PROCESSING",
  READY_FOR_PICKUP: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  REVERSED: "FAILED",
};
const TENKIPAY_TRANSFERS = "/api/v1/merchant/transfers";

/** TenkiPay wants a Sierra Leone mobile number in its local form (0XX...), or the wallet number. */
const tenkipayAccount = (p: Payout) => (p.wallet === "TENKIPAY" ? p.account! : p.account!.replace(/^\+232/, "0"));

const DESCRIPTION: Record<PayoutKind, string> = {
  REFUND: "Mi Dokta refund",
  DOCTOR_SHARE: "Mi Dokta consultation fee",
  PHARMACY_SHARE: "Mi Dokta pharmacy order",
};

async function sendViaTenkipay(p: Payout): Promise<Sent> {
  const amount = p.amount.toFixed(2);
  const destination = { type: TENKIPAY_DESTINATION[p.wallet!], account: tenkipayAccount(p) };
  const quote = await tenkipay<{ total_debit: string }>("POST", `${TENKIPAY_TRANSFERS}/quote`, { amount, currency: CURRENCY, destination });
  const transfer = await tenkipay<TenkiPayTransfer>(
    "POST",
    TENKIPAY_TRANSFERS,
    { amount, currency: CURRENCY, destination, reference: p.id, max_total_debit: quote.total_debit, description: DESCRIPTION[p.kind] },
    p.id,
  );
  return { id: transfer.id, status: TENKIPAY_TRANSFER_STATUS[transfer.status], failure: transfer.failure_reason };
}

/** Asks the provider how a payout it accepted is going. */
async function checkPayout(p: Payout): Promise<void> {
  if (p.status !== "PROCESSING" || !p.providerId) return;
  const id = encodeURIComponent(p.providerId);
  if (p.viaTenkipay) {
    const t = await tenkipay<TenkiPayTransfer>("GET", `${TENKIPAY_TRANSFERS}/${id}`);
    await settle(p, { id: p.providerId, status: TENKIPAY_TRANSFER_STATUS[t.status], failure: t.failure_reason });
  } else {
    const m = await monime<MonimePayout>(`/payouts/${id}`, { method: "GET" });
    await settle(p, { id: p.providerId, status: MONIME_PAYOUT_STATUS[m.status], failure: m.failureDetail?.message });
  }
}

/** Records a payout's new status, and tells people about the outcome exactly once. */
async function settle(p: Payout, sent: Sent): Promise<void> {
  const { count } = await prisma.payout.updateMany({
    where: { id: p.id, status: { in: ["PENDING", "PROCESSING"] } },
    data: {
      status: sent.status,
      providerId: sent.id || p.providerId,
      failureReason: sent.status === "FAILED" ? (sent.failure ?? "Failed at the provider.") : null,
    },
  });
  if (count === 0 || (sent.status !== "COMPLETED" && sent.status !== "FAILED")) return;
  await announce(p, sent.status === "COMPLETED", sent.failure);
}

/** What a payout was for, in words, and where staff look at it. */
async function describe(p: Payout) {
  if (p.orderId) {
    const o = await prisma.pharmacyOrder.findUniqueOrThrow({ where: { id: p.orderId }, include: { patient: true, pharmacy: true } });
    return {
      patient: o.patient,
      invoiceId: o.invoiceId,
      what: `order #${o.number}`,
      recipientName: o.pharmacy.name,
      recipientLink: "/staff/pharmacy",
      patientLink: `/patient/pharmacy/orders/${o.id}`,
    };
  }
  const c = await prisma.consultation.findUniqueOrThrow({ where: { id: p.consultationId! }, include: { patient: true, doctor: true } });
  return {
    patient: c.patient,
    invoiceId: c.invoiceId,
    what: `${c.patient.firstName} ${c.patient.lastName}'s visit on ${formatDate(c.startsAt.toISOString())}`,
    recipientName: `Dr. ${c.doctor.firstName} ${c.doctor.lastName}`,
    recipientLink: "/doctor/settings",
    patientLink: `/patient/billing/${c.invoiceId}`,
  };
}

async function announce(p: Payout, completed: boolean, failure?: string | null) {
  const d = await describe(p);
  const amount = formatMoney(p.amount.toString());
  const to = `${WALLET_LABEL[p.wallet!]} ${p.account}`;
  const refund = p.kind === "REFUND";

  if (!completed) {
    const whom = refund ? `${d.patient.firstName} ${d.patient.lastName}` : d.recipientName;
    await notifyRoles([Role.ADMIN], {
      type: "GENERAL",
      title: refund ? "Refund failed" : "Payout failed",
      body: `${refund ? "Refund" : "Payment"} of ${amount} to ${whom} (${to}) for ${d.what} failed: ${failure ?? "no reason given"}. Send it by hand from ${providerName(p.viaTenkipay)}.`,
      link: `${PORTAL_TOKEN}/billing/${d.invoiceId}`,
    });
    return;
  }

  if (refund) {
    await queueSms({
      userId: p.recipientId,
      category: "PAYMENT_RECEIVED",
      body: `${SMS_BRAND}: Hi ${d.patient.firstName}, ${amount} for your ${p.orderId ? "pharmacy order" : "consultation"} has been refunded to your ${to}.`,
      dedupeKey: `refund:${p.id}`,
    });
    await notifyUsers([p.recipientId], { type: "PAYMENT_RECEIVED", title: "Refund sent", body: `${amount} was sent back to your ${to}.`, link: d.patientLink });
  } else {
    await notifyUsers([p.recipientId], {
      type: "PAYMENT_RECEIVED",
      title: "Payment sent to you",
      body: `${amount} for ${d.what} was sent to your ${to}.`,
      link: d.recipientLink,
    });
  }
}

/** Sends payouts whose first try got no answer, and checks on those in progress. Run from the scheduled job. */
export async function syncPayouts(): Promise<{ checked: number }> {
  const open = await prisma.payout.findMany({
    // Leave very recent ones to the request that's sending them.
    where: { status: { in: ["PENDING", "PROCESSING"] }, wallet: { not: null }, updatedAt: { lt: new Date(Date.now() - 2 * 60 * 1000) } },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  for (const p of open) {
    try {
      await (p.status === "PENDING" ? sendPayout(p) : checkPayout(p));
    } catch (e) {
      console.error(`Checking payout ${p.id} failed`, e);
    }
  }
  return { checked: open.length };
}
