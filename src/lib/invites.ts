import "server-only";

import { randomBytes } from "crypto";
import type { MobileWallet, PatientInvite, User, VisitType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appBaseUrl } from "@/lib/url";
import { formatMoney } from "@/lib/money";
import { normalizePhone } from "@/lib/sms/phone";
import { queueSmsToNumber } from "@/lib/sms";
import { SMS_BRAND, gsmSafe } from "@/lib/sms/templates";
import { notifyUsers } from "@/lib/notifications";
import { bookConsultation } from "@/lib/consultations";
import { formatDate, formatTime } from "@/components/appointments/shared";

/**
 * Doctors booking a visit for someone who isn't on MiDokta yet. The person is texted a link to
 * /invite/<token>; registering there books the visit with that doctor at the time the doctor chose.
 * With a fee, they pay it first (the usual consultation flow) and the visit is confirmed once paid;
 * without one, it's confirmed straight away. The doctor vouches for the patient, so the account can
 * sign in immediately; their photo and ID are still checked in the background.
 */

/** A link stays valid this long, or until the visit time, whichever comes first. */
const VALID_DAYS = 14;

const when = (d: Date) => `${formatDate(d.toISOString())} at ${formatTime(d.toISOString())}`;

/** Accounts that already use this number (it must be new to register with it). */
async function accountsWithPhone(phone: string) {
  const users = await prisma.user.findMany({ where: { phone: { not: null } }, select: { id: true, phone: true } });
  return users.filter((u) => normalizePhone(u.phone) === phone);
}

type NewInvite = { doctor: User; firstName: string; lastName: string; phone: string; title: string; startsAt: Date; visitType: VisitType };

export async function createInvite(n: NewInvite): Promise<{ ok: true; invite: PatientInvite } | { ok: false; error: string }> {
  if ((await accountsWithPhone(n.phone)).length > 0) {
    return { ok: false, error: "This phone number is already registered on MiDokta. That patient can book you from their app (Appointments)." };
  }
  const open = await prisma.patientInvite.count({ where: { doctorId: n.doctor.id, phone: n.phone, status: "PENDING", expiresAt: { gt: new Date() } } });
  if (open > 0) return { ok: false, error: "You've already invited this number. Cancel that invitation first to send a new one." };

  const fee = n.doctor.consultationFee?.isPositive() ? n.doctor.consultationFee : null;
  const expiresAt = new Date(Math.min(n.startsAt.getTime(), Date.now() + VALID_DAYS * 86400_000));
  const invite = await prisma.patientInvite.create({
    data: { token: randomBytes(18).toString("base64url"), doctorId: n.doctor.id, firstName: n.firstName, lastName: n.lastName, phone: n.phone, title: n.title, startsAt: n.startsAt, visitType: n.visitType, fee, expiresAt },
  });

  const link = `${await appBaseUrl()}/invite/${invite.token}`;
  const visit = n.visitType === "VIDEO_CALL" ? "a video visit" : "a visit";
  const body = `${SMS_BRAND}: Hi ${n.firstName}, Dr. ${n.doctor.lastName} booked you ${visit} on ${when(n.startsAt)}${fee ? ` (fee ${formatMoney(fee.toString())}, paid online)` : ""}. Register to confirm: ${link}`;
  await queueSmsToNumber(n.phone, gsmSafe(body), "PATIENT_INVITE", n.doctor.id);
  return { ok: true, invite };
}

/** The invitation behind a link, if it can still be used. */
export async function openInvite(token: string) {
  const invite = await prisma.patientInvite.findUnique({ where: { token }, include: { doctor: true } });
  if (!invite || invite.status !== "PENDING" || invite.expiresAt < new Date()) return null;
  return invite;
}

/**
 * Books the invited visit for the newly registered patient. Returns where to send them: the fee
 * invoice to pay, or their appointments.
 */
export async function acceptInvite(invite: PatientInvite & { doctor: User }, patient: User, refund: { wallet: MobileWallet; account: string } | null): Promise<string> {
  // Claim it first, so a double submit can't book twice.
  const { count } = await prisma.patientInvite.updateMany({ where: { id: invite.id, status: "PENDING" }, data: { status: "ACCEPTED", patientId: patient.id, acceptedAt: new Date() } });
  if (count === 0) return "/patient/appointments";

  const name = `${patient.firstName} ${patient.lastName}`;
  if (invite.fee && refund) {
    const invoiceId = await bookConsultation({
      patient,
      doctor: invite.doctor,
      fee: invite.fee,
      title: invite.title,
      startsAt: invite.startsAt,
      visitType: invite.visitType,
      refundWallet: refund.wallet,
      refundAccount: refund.account,
    });
    await prisma.patientInvite.update({ where: { id: invite.id }, data: { invoiceId } });
    await notifyUsers([invite.doctorId], {
      type: "GENERAL",
      title: "Your invited patient registered",
      body: `${name} registered for the visit on ${when(invite.startsAt)}. It's confirmed once they pay the fee.`,
      link: "/doctor/patients",
    });
    return `/patient/billing/${invoiceId}`;
  }

  const appt = await prisma.appointment.create({
    data: {
      title: invite.title,
      patientId: patient.id,
      doctorId: invite.doctorId,
      hospitalId: invite.doctor.hospitalId,
      startsAt: invite.startsAt,
      visitType: invite.visitType,
      status: "CONFIRMED",
    },
  });
  await prisma.patientInvite.update({ where: { id: invite.id }, data: { appointmentId: appt.id } });
  await notifyUsers([invite.doctorId], {
    type: "APPOINTMENT_CONFIRMED",
    title: "Invited patient registered: visit confirmed",
    body: `${name} · ${when(invite.startsAt)}`,
    link: `/doctor/appointments/${appt.id}`,
  });
  return "/patient/appointments";
}
