import "server-only";

import {
  Prisma,
  Role,
  type AppointmentStatus,
  type CheckoutChannel,
  type Consultation,
  type MobileWallet,
  type Payout,
  type PayoutKind,
  type PayoutStatus,
  type User,
  type VisitType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CURRENCY, formatMoney } from "@/lib/money";
import { ProviderRejected, availableChannels, monime, tenkipay, toMinor } from "@/lib/payments";
import { PORTAL_TOKEN, notifyRoles, notifyUsers } from "@/lib/notifications";
import { FRONT_DESK_ROLES } from "@/lib/roles";
import { isUniqueViolation } from "@/lib/form";
import { queueSms } from "@/lib/sms";
import { SMS_BRAND } from "@/lib/sms/templates";
import { normalizePhone } from "@/lib/sms/phone";
import { formatDate, formatTime } from "@/components/appointments/shared";

/**
 * Consultation fees. A doctor sets a fee; a patient booking them pays it online first, and only then
 * does the doctor see the request. The platform keeps PLATFORM_FEE_RATE of the fee. The doctor's share
 * is sent to their mobile money when the visit is completed; if the visit is declined or cancelled
 * before that, the whole fee goes back to the patient instead. Money always leaves through the
 * provider it came in through (Monime, or TenkiPay for TenkiPay payments).
 *
 * The doctor is paid on completion rather than at booking because a booking can still be declined
 * or cancelled, and money already sent to a doctor can't be pulled back for a refund.
 */

/** The platform's share of each consultation fee; the doctor gets the rest. */
export const PLATFORM_FEE_RATE = new Prisma.Decimal("0.10");

export function splitFee(fee: Prisma.Decimal) {
  const platformFee = fee.times(PLATFORM_FEE_RATE).toDecimalPlaces(2);
  return { platformFee, doctorShare: fee.minus(platformFee) };
}

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

/** The fee a doctor charges, or null if booking them is free. */
export const feeOf = (doctor: Pick<User, "consultationFee">) => (doctor.consultationFee?.isPositive() ? doctor.consultationFee : null);

// ---- Booking and paying -------------------------------------------------------------------------

type Booking = {
  patient: User;
  doctor: User;
  fee: Prisma.Decimal;
  title: string;
  startsAt: Date;
  visitType: VisitType;
  refundWallet: MobileWallet;
  refundAccount: string;
};

/** Creates the fee invoice and the booking that waits on it. Returns the invoice to pay. */
export async function bookConsultation(b: Booking): Promise<string> {
  const { platformFee, doctorShare } = splitFee(b.fee);
  const hospitalId = b.doctor.hospitalId ?? b.patient.hospitalId;
  const invoice = await prisma.invoice.create({
    data: {
      patientId: b.patient.id,
      hospitalId,
      total: b.fee,
      notes: `Consultation fee, paid when booking. Refunded in full if the visit is declined or cancelled.`,
      items: { create: [{ description: `Consultation with Dr. ${b.doctor.firstName} ${b.doctor.lastName}`, quantity: 1, unitPrice: b.fee }] },
      consultation: {
        create: {
          patientId: b.patient.id,
          doctorId: b.doctor.id,
          title: b.title,
          startsAt: b.startsAt,
          visitType: b.visitType,
          hospitalId,
          fee: b.fee,
          platformFee,
          doctorShare,
          refundWallet: b.refundWallet,
          refundAccount: b.refundAccount,
        },
      },
    },
  });
  return invoice.id;
}

/**
 * Why the invoice can't be paid online right now, or null if it can. Only consultation fees have
 * such limits: the booked time must still be ahead.
 */
export async function consultationPayProblem(invoiceId: string): Promise<string | null> {
  const c = await prisma.consultation.findUnique({ where: { invoiceId }, select: { startsAt: true, paidAt: true } });
  if (!c || c.paidAt) return null;
  return c.startsAt.getTime() < Date.now() ? "The time you booked has passed. Please book a new time." : null;
}

/** The payment methods offered for an invoice: for a consultation fee, only those that can refund it. */
export async function channelsForInvoice(invoiceId: string): Promise<CheckoutChannel[]> {
  const c = await prisma.consultation.findUnique({ where: { invoiceId }, select: { refundWallet: true } });
  return c ? channelsRefundableTo(c.refundWallet) : availableChannels();
}

const when = (d: Date) => `${formatDate(d.toISOString())} at ${formatTime(d.toISOString())}`;

/**
 * Called once a consultation invoice is paid in full: turns the booking into an appointment request
 * and tells the doctor. Safe to call more than once.
 */
export async function onConsultationPaid(invoiceId: string, channel: CheckoutChannel | null): Promise<void> {
  const c = await prisma.consultation.findUnique({ where: { invoiceId }, include: { patient: true } });
  if (!c || c.appointmentId) return;

  const appt = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Consultation" WHERE id = ${c.id} FOR UPDATE`;
    const fresh = await tx.consultation.findUniqueOrThrow({ where: { id: c.id } });
    if (fresh.appointmentId) return null;
    const appt = await tx.appointment.create({
      data: {
        title: c.title,
        patientId: c.patientId,
        doctorId: c.doctorId,
        hospitalId: c.hospitalId,
        startsAt: c.startsAt,
        visitType: c.visitType,
        status: "PENDING",
      },
    });
    await tx.consultation.update({ where: { id: c.id }, data: { appointmentId: appt.id, paidVia: channel, paidAt: new Date() } });
    await tx.invoice.update({ where: { id: invoiceId }, data: { appointmentId: appt.id } });
    return appt;
  });
  if (!appt) return;

  const { patient } = c;
  const body = `${patient.firstName} ${patient.lastName} · ${c.title} · ${when(c.startsAt)}${c.visitType === "VIDEO_CALL" ? " (video call)" : ""} · fee ${formatMoney(c.fee.toString())} paid`;
  await notifyUsers([c.doctorId], { type: "APPOINTMENT_REQUEST", title: "Paid appointment request from a patient", body, link: `/doctor/appointments/${appt.id}` });
  await notifyRoles(FRONT_DESK_ROLES, { type: "APPOINTMENT_REQUEST", title: "New paid appointment request", body, link: `${PORTAL_TOKEN}/appointments` });
}

// ---- Paying out ---------------------------------------------------------------------------------

type ConsultationWithPeople = Consultation & { doctor: User; patient: User; payouts: Payout[] };

/**
 * Called whenever an appointment's status changes. A paid consultation that's completed pays the
 * doctor; one that's declined or cancelled refunds the patient. Each happens at most once, and never
 * both: if one was already sent, admins are asked to sort out the other by hand.
 */
export async function onAppointmentStatusChanged(appointmentId: string, status: AppointmentStatus): Promise<void> {
  const kind: PayoutKind | null = status === "COMPLETED" ? "DOCTOR_SHARE" : status === "REJECTED" || status === "CANCELLED" ? "REFUND" : null;
  if (!kind) return;
  const c = await prisma.consultation.findUnique({ where: { appointmentId }, include: { doctor: true, patient: true, payouts: true } });
  if (!c?.paidAt || c.payouts.some((p) => p.kind === kind)) return;

  if (c.payouts.length > 0) {
    await notifyRoles([Role.ADMIN], {
      type: "GENERAL",
      title: kind === "REFUND" ? "Refund needs checking" : "Doctor payment needs checking",
      body:
        kind === "REFUND"
          ? `${c.patient.firstName} ${c.patient.lastName}'s visit was marked ${status.toLowerCase()} after Dr. ${c.doctor.lastName} was paid. Refund the patient by hand if they're owed one.`
          : `${c.patient.firstName} ${c.patient.lastName}'s visit was marked completed after their fee was refunded. Pay Dr. ${c.doctor.lastName} by hand if they're owed.`,
      link: `${PORTAL_TOKEN}/billing/${c.invoiceId}`,
    });
    return;
  }
  await startPayout(c, kind);
}

async function startPayout(c: ConsultationWithPeople, kind: PayoutKind) {
  const refund = kind === "REFUND";
  const wallet = refund ? c.refundWallet : c.doctor.payoutWallet;
  const account = refund ? c.refundAccount : c.doctor.payoutAccount;
  let payout: Payout;
  try {
    payout = await prisma.payout.create({
      data: {
        consultationId: c.id,
        kind,
        recipientId: refund ? c.patientId : c.doctorId,
        amount: refund ? c.fee : c.doctorShare,
        viaTenkipay: c.paidVia === "TENKIPAY",
        wallet: wallet && account ? wallet : null,
        account: wallet && account ? account : null,
      },
    });
  } catch (e) {
    if (isUniqueViolation(e)) return; // started by a concurrent request
    throw e;
  }

  if (!payout.wallet) {
    await prisma.payout.update({ where: { id: payout.id }, data: { failureReason: "Waiting for the doctor to add a payout number." } });
    await notifyUsers([c.doctorId], {
      type: "PAYMENT_RECEIVED",
      title: "Add your payout number to get paid",
      body: `${formatMoney(payout.amount.toString())} is waiting for you. Add your mobile money number in Settings and it's sent straight away.`,
      link: "/doctor/settings",
    });
    return;
  }
  await sendPayout(payout);
}

/** A doctor added a payout number: send what was waiting for one. */
export async function sendWaitingPayouts(doctor: User): Promise<void> {
  if (!doctor.payoutWallet || !doctor.payoutAccount) return;
  await prisma.payout.updateMany({
    where: { recipientId: doctor.id, kind: "DOCTOR_SHARE", status: "PENDING", wallet: null },
    data: { wallet: doctor.payoutWallet, account: doctor.payoutAccount, failureReason: null },
  });
  const ready = await prisma.payout.findMany({ where: { recipientId: doctor.id, kind: "DOCTOR_SHARE", status: "PENDING", providerId: null } });
  for (const p of ready) await sendPayout(p);
}

type Sent = { id: string; status: PayoutStatus; failure?: string | null };

/**
 * Asks the provider to send a pending payout. The payout's own id is the idempotency key, so a retry
 * (from the scheduled job) after a lost answer can't send the money twice. A refusal from the provider
 * fails the payout and alerts admins; a network error leaves it pending for the next try.
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

async function sendViaTenkipay(p: Payout): Promise<Sent> {
  const amount = p.amount.toFixed(2);
  const destination = { type: TENKIPAY_DESTINATION[p.wallet!], account: tenkipayAccount(p) };
  const quote = await tenkipay<{ total_debit: string }>("POST", `${TENKIPAY_TRANSFERS}/quote`, { amount, currency: CURRENCY, destination });
  const transfer = await tenkipay<TenkiPayTransfer>(
    "POST",
    TENKIPAY_TRANSFERS,
    {
      amount,
      currency: CURRENCY,
      destination,
      reference: p.id,
      max_total_debit: quote.total_debit,
      description: p.kind === "REFUND" ? "Mi Dokta consultation refund" : "Mi Dokta consultation fee",
    },
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

  const c = await prisma.consultation.findUniqueOrThrow({ where: { id: p.consultationId }, include: { patient: true, doctor: true } });
  const amount = formatMoney(p.amount.toString());
  const to = `${WALLET_LABEL[p.wallet!]} ${p.account}`;

  if (sent.status === "FAILED") {
    const what = p.kind === "REFUND" ? `Refund of ${amount} to ${c.patient.firstName} ${c.patient.lastName}` : `Payment of ${amount} to Dr. ${c.doctor.firstName} ${c.doctor.lastName}`;
    await notifyRoles([Role.ADMIN], {
      type: "GENERAL",
      title: p.kind === "REFUND" ? "Refund failed" : "Doctor payment failed",
      body: `${what} (${to}) failed: ${sent.failure ?? "no reason given"}. Send it by hand from ${providerName(p.viaTenkipay)}.`,
      link: `${PORTAL_TOKEN}/billing/${c.invoiceId}`,
    });
    return;
  }

  if (p.kind === "REFUND") {
    await queueSms({
      userId: c.patientId,
      category: "PAYMENT_RECEIVED",
      body: `${SMS_BRAND}: Hi ${c.patient.firstName}, your consultation fee of ${amount} has been refunded to your ${to}.`,
      dedupeKey: `refund:${p.id}`,
    });
    await notifyUsers([c.patientId], { type: "PAYMENT_RECEIVED", title: "Consultation fee refunded", body: `${amount} was sent back to your ${to}.`, link: `/patient/billing/${c.invoiceId}` });
  } else {
    await notifyUsers([c.doctorId], {
      type: "PAYMENT_RECEIVED",
      title: "Consultation fee paid to you",
      body: `${amount} for ${c.patient.firstName} ${c.patient.lastName}'s visit on ${formatDate(c.startsAt.toISOString())} was sent to your ${to}.`,
      link: "/doctor/settings",
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
