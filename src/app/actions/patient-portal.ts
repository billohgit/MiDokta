"use server";

import { revalidatePath } from "next/cache";
import { Role, VisitType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/auth";
import { type ActionResult, DENIED, enumValue, fail, text } from "@/lib/form";
import { PORTAL_TOKEN, notifyRoles, notifyUsers } from "@/lib/notifications";
import { FRONT_DESK_ROLES } from "@/lib/roles";
import { queueSms } from "@/lib/sms";
import { sms } from "@/lib/sms/templates";
import { formatDate, formatTime } from "@/components/appointments/shared";

/** Requests a patient can have waiting at once, so the inbox can't be flooded. */
const MAX_OPEN_REQUESTS = 5;
const MAX_REASON_LENGTH = 120;

const when = (d: Date) => `${formatDate(d.toISOString())} at ${formatTime(d.toISOString())}`;

/** A patient asks for an appointment, with a doctor of their choice or whoever is free. */
export async function requestAppointment(formData: FormData): Promise<ActionResult> {
  const me = await authorize(Role.PATIENT);
  if (!me) return DENIED;

  const doctorId = text(formData, "doctorId");
  const date = text(formData, "date");
  const time = text(formData, "time");
  const visitType = enumValue(formData, "visitType", Object.values(VisitType));
  const reason = text(formData, "title")?.slice(0, MAX_REASON_LENGTH) ?? "Consultation";

  if (!date || !time) return fail("Choose a date and time.");
  if (!visitType) return fail("Choose in person or video call.");
  const startsAt = new Date(`${date}T${time}`);
  if (isNaN(startsAt.getTime())) return fail("Invalid date or time.");
  if (startsAt.getTime() < Date.now()) return fail("Choose a time in the future.");

  const doctor = doctorId ? await prisma.user.findFirst({ where: { id: doctorId, role: Role.DOCTOR, isActive: true } }) : null;
  if (doctorId && !doctor) return fail("That doctor isn't available. Choose another, or any doctor.");

  const open = await prisma.appointment.count({ where: { patientId: me.id, status: "PENDING" } });
  if (open >= MAX_OPEN_REQUESTS) return fail("You already have several requests waiting. The clinic will get back to you soon.");

  const appt = await prisma.appointment.create({
    data: {
      title: reason,
      patientId: me.id,
      doctorId: doctor?.id ?? null,
      hospitalId: doctor?.hospitalId ?? me.hospitalId,
      startsAt,
      visitType,
      status: "PENDING",
    },
  });

  const body = `${me.firstName} ${me.lastName} · ${reason} · ${when(startsAt)}${visitType === "VIDEO_CALL" ? " (video call)" : ""}`;
  if (doctor) {
    await notifyUsers([doctor.id], { type: "APPOINTMENT_REQUEST", title: "Appointment request from a patient", body, link: `/doctor/appointments/${appt.id}` });
  } else {
    await notifyRoles([Role.DOCTOR], { type: "APPOINTMENT_REQUEST", title: "New appointment request", body, link: "/doctor/appointments" });
  }
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
