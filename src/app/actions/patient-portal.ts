"use server";

import { revalidatePath } from "next/cache";
import { MobileWallet, Role, VisitType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/auth";
import { type ActionResult, DENIED, enumValue, fail, text } from "@/lib/form";
import { PORTAL_TOKEN, notifyRoles, notifyUsers } from "@/lib/notifications";
import { FRONT_DESK_ROLES } from "@/lib/roles";
import { queueSms } from "@/lib/sms";
import { sms } from "@/lib/sms/templates";
import { formatDate, formatTime } from "@/components/appointments/shared";
import { bookConsultation, channelsRefundableTo, feeOf, onAppointmentStatusChanged, walletAccount } from "@/lib/consultations";

/** Requests a patient can have waiting at once, so the inbox can't be flooded. */
const MAX_OPEN_REQUESTS = 5;
const MAX_REASON_LENGTH = 120;

const when = (d: Date) => `${formatDate(d.toISOString())} at ${formatTime(d.toISOString())}`;

/**
 * A patient asks for an appointment with a doctor. If the doctor charges a fee, nothing reaches them
 * yet: a fee invoice is created and its id returned as `payInvoiceId`, and the request is sent once
 * that's paid (see src/lib/consultations.ts).
 */
export async function requestAppointment(formData: FormData): Promise<ActionResult & { payInvoiceId?: string }> {
  const me = await authorize(Role.PATIENT);
  if (!me) return DENIED;

  const doctorId = text(formData, "doctorId");
  const date = text(formData, "date");
  const time = text(formData, "time");
  const visitType = enumValue(formData, "visitType", Object.values(VisitType));
  const reason = text(formData, "title")?.slice(0, MAX_REASON_LENGTH) ?? "Consultation";

  if (!doctorId) return fail("Choose a doctor.");
  if (!date || !time) return fail("Choose a date and time.");
  if (!visitType) return fail("Choose in person or video call.");
  const startsAt = new Date(`${date}T${time}`);
  if (isNaN(startsAt.getTime())) return fail("Invalid date or time.");
  if (startsAt.getTime() < Date.now()) return fail("Choose a time in the future.");

  const doctor = await prisma.user.findFirst({ where: { id: doctorId, role: Role.DOCTOR, isActive: true } });
  if (!doctor) return fail("That doctor isn't available. Choose another.");

  const [open, unpaid] = await Promise.all([
    prisma.appointment.count({ where: { patientId: me.id, status: "PENDING" } }),
    prisma.consultation.count({ where: { patientId: me.id, paidAt: null, startsAt: { gt: new Date() } } }),
  ]);
  if (open + unpaid >= MAX_OPEN_REQUESTS) return fail("You already have several requests waiting. The clinic will get back to you soon.");

  const fee = feeOf(doctor);
  if (fee) {
    const refundWallet = enumValue(formData, "refundWallet", Object.values(MobileWallet));
    if (!refundWallet) return fail("Choose where a refund should go.");
    const refundAccount = walletAccount(refundWallet, text(formData, "refundAccount"));
    if (!refundAccount) return fail(refundWallet === "TENKIPAY" ? "Enter your TenkiPay wallet number." : "Enter a valid Sierra Leone mobile number for refunds.");
    if (channelsRefundableTo(refundWallet).length === 0) return fail("Online payment isn't available for that account right now. Choose another.");
    const payInvoiceId = await bookConsultation({ patient: me, doctor, fee, title: reason, startsAt, visitType, refundWallet, refundAccount });
    revalidatePath("/", "layout");
    return { ok: true, payInvoiceId };
  }

  const appt = await prisma.appointment.create({
    data: {
      title: reason,
      patientId: me.id,
      doctorId: doctor.id,
      hospitalId: doctor.hospitalId ?? me.hospitalId,
      startsAt,
      visitType,
      status: "PENDING",
    },
  });

  const body = `${me.firstName} ${me.lastName} · ${reason} · ${when(startsAt)}${visitType === "VIDEO_CALL" ? " (video call)" : ""}`;
  await notifyUsers([doctor.id], { type: "APPOINTMENT_REQUEST", title: "Appointment request from a patient", body, link: `/doctor/appointments/${appt.id}` });
  await notifyRoles(FRONT_DESK_ROLES, { type: "APPOINTMENT_REQUEST", title: "New appointment request", body, link: `${PORTAL_TOKEN}/appointments` });

  revalidatePath("/", "layout");
  return { ok: true, id: appt.id };
}

const MAX_COMMENT_LENGTH = 500;

/**
 * A patient rates a completed visit from 1 to 5 stars, with an optional comment. Rating the same
 * visit again replaces the earlier rating. The doctor is told about a new rating, without the
 * patient's name.
 */
export async function rateVisit(appointmentId: string, stars: number, comment: string): Promise<ActionResult> {
  const me = await authorize(Role.PATIENT);
  if (!me) return DENIED;
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return fail("Choose from 1 to 5 stars.");

  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, patientId: me.id },
    include: { rating: { select: { id: true } } },
  });
  if (!appt) return fail("Appointment not found.");
  if (appt.status !== "COMPLETED" || !appt.doctorId) return fail("You can rate a visit once it's completed.");

  const note = comment.trim().slice(0, MAX_COMMENT_LENGTH) || null;
  await prisma.doctorRating.upsert({
    where: { appointmentId },
    create: { appointmentId, doctorId: appt.doctorId, patientId: me.id, stars, comment: note },
    update: { stars, comment: note },
  });

  if (!appt.rating) {
    await notifyUsers([appt.doctorId], {
      type: "GENERAL",
      title: "New patient rating",
      body: `A patient rated their visit on ${formatDate(appt.startsAt.toISOString())} ${stars} out of 5 stars.`,
      link: "/doctor/dashboard",
    });
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

/** A patient cancels one of their own upcoming appointments or requests. */
export async function cancelMyAppointment(id: string): Promise<ActionResult> {
  const me = await authorize(Role.PATIENT);
  if (!me) return DENIED;

  const appt = await prisma.appointment.findFirst({ where: { id, patientId: me.id } });
  if (!appt) return fail("Appointment not found.");
  if (appt.status !== "PENDING" && appt.status !== "CONFIRMED") return fail("This appointment can't be cancelled.");
  if (appt.startsAt.getTime() < Date.now()) return fail("This appointment has already started. Please contact the clinic.");

  await prisma.appointment.update({ where: { id }, data: { status: "CANCELLED" } });
  // A paid consultation is refunded in full.
  await onAppointmentStatusChanged(id, "CANCELLED");

  const body = `${me.firstName} ${me.lastName} cancelled their appointment on ${when(appt.startsAt)}.`;
  if (appt.doctorId) {
    await notifyUsers([appt.doctorId], { type: "APPOINTMENT_CANCELLED", title: "Appointment cancelled by patient", body, link: `/doctor/appointments/${id}` });
    if (appt.status === "CONFIRMED") {
      await queueSms({ userId: appt.doctorId, category: "APPOINTMENT_CANCELLED", body: sms.doctorCancelled(me, appt) });
    }
  }
  await notifyRoles(FRONT_DESK_ROLES, { type: "APPOINTMENT_CANCELLED", title: "Appointment cancelled by patient", body, link: `${PORTAL_TOKEN}/appointments` });

  revalidatePath("/", "layout");
  return { ok: true };
}
