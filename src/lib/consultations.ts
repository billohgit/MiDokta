import "server-only";

import { Prisma, Role, type AppointmentStatus, type CheckoutChannel, type MobileWallet, type PayoutKind, type User, type VisitType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { PORTAL_TOKEN, notifyRoles, notifyUsers } from "@/lib/notifications";
import { FRONT_DESK_ROLES } from "@/lib/roles";
import { platformFeeOf, startPayout } from "@/lib/payouts";
import { formatDate, formatTime } from "@/components/appointments/shared";

/**
 * Consultation fees. A doctor sets a fee; a patient booking them pays it online first, and only then
 * does the doctor see the request. The platform keeps PLATFORM_FEE_RATE of the fee (src/lib/payouts.ts).
 * The doctor's share is sent to their mobile money when the visit is completed; if the visit is
 * declined or cancelled before that, the whole fee goes back to the patient instead.
 *
 * The doctor is paid on completion rather than at booking because a booking can still be declined
 * or cancelled, and money already sent to a doctor can't be pulled back for a refund.
 */

export function splitFee(fee: Prisma.Decimal) {
  const platformFee = platformFeeOf(fee);
  return { platformFee, doctorShare: fee.minus(platformFee) };
}

/** The fee a doctor charges, or null if booking them is free. */
export const feeOf = (doctor: Pick<User, "consultationFee">) => (doctor.consultationFee?.isPositive() ? doctor.consultationFee : null);

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

  const refund = kind === "REFUND";
  const result = await startPayout({
    consultationId: c.id,
    kind,
    recipientId: refund ? c.patientId : c.doctorId,
    amount: refund ? c.fee : c.doctorShare,
    paidVia: c.paidVia,
    wallet: refund ? c.refundWallet : c.doctor.payoutWallet,
    account: refund ? c.refundAccount : c.doctor.payoutAccount,
  });
  if (result === "waiting") {
    await notifyUsers([c.doctorId], {
      type: "PAYMENT_RECEIVED",
      title: "Add your payout number to get paid",
      body: `${formatMoney(c.doctorShare.toString())} is waiting for you. Add your mobile money number in Settings and it's sent straight away.`,
      link: "/doctor/settings",
    });
  }
}
