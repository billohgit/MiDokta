"use server";

import { revalidatePath } from "next/cache";
import { AppointmentStatus, type NotificationType, Role, VisitType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/auth";
import { PORTAL_TOKEN, notifyRoles, notifyUsers } from "@/lib/notifications";
import { FRONT_DESK_ROLES } from "@/lib/roles";
import { queueSms } from "@/lib/sms";
import { sms } from "@/lib/sms/templates";
import { formatDate, formatTime } from "@/components/appointments/shared";

export type ActionResult = { ok: true } | { ok: false; error: string };

const refresh = () => revalidatePath("/", "layout");

// Statuses a doctor may move an appointment into.
const DOCTOR_ALLOWED: AppointmentStatus[] = ["CONFIRMED", "REJECTED", "COMPLETED", "CANCELLED"];

const STATUS_NOTIFICATION: Partial<Record<AppointmentStatus, { type: NotificationType; verb: string }>> = {
  CONFIRMED: { type: "APPOINTMENT_CONFIRMED", verb: "confirmed" },
  REJECTED: { type: "APPOINTMENT_REJECTED", verb: "rejected" },
  CANCELLED: { type: "APPOINTMENT_CANCELLED", verb: "cancelled" },
  COMPLETED: { type: "APPOINTMENT_COMPLETED", verb: "completed" },
};

const when = (d: Date) => `${formatDate(d.toISOString())} at ${formatTime(d.toISOString())}`;

export async function setAppointmentStatus(id: string, status: AppointmentStatus): Promise<ActionResult> {
  const user = await authorize(Role.DOCTOR, ...FRONT_DESK_ROLES);
  if (!user) return { ok: false, error: "You are not allowed to do that." };
  if (!Object.values(AppointmentStatus).includes(status)) return { ok: false, error: "Invalid status." };

  const appt = await prisma.appointment.findUnique({
    where: { id },
    include: {
      patient: { select: { firstName: true, lastName: true } },
      doctor: { select: { firstName: true, lastName: true } },
      hospital: { select: { name: true } },
    },
  });
  if (!appt) return { ok: false, error: "Appointment not found." };

  let doctorId = appt.doctorId;
  if (user.role === Role.DOCTOR) {
    const mine = appt.doctorId === user.id;
    // Doctors may claim an unassigned pending request by accepting it.
    const claiming = appt.doctorId === null && appt.status === "PENDING" && status === "CONFIRMED";
    if ((!mine && !claiming) || !DOCTOR_ALLOWED.includes(status)) {
      return { ok: false, error: "You are not allowed to do that." };
    }
    doctorId = user.id;
  }

  await prisma.appointment.update({ where: { id }, data: { status, doctorId } });

  if (status !== appt.status && appt.startsAt > new Date()) {
    const byFrontDesk = user.role !== Role.DOCTOR;
    await sendStatusSms(appt, status, doctorId, byFrontDesk ? appt.doctor : user, byFrontDesk);
  }

  const n = STATUS_NOTIFICATION[status];
  if (n && status !== appt.status) {
    const patient = `${appt.patient.firstName} ${appt.patient.lastName}`;
    const actor = user.role === Role.DOCTOR ? `Dr. ${user.firstName} ${user.lastName}` : "The front desk";
    const notification = {
      type: n.type,
      title: `Appointment ${n.verb}`,
      body: `${actor} ${n.verb} ${patient}'s appointment on ${when(appt.startsAt)}.`,
    };
    if (user.role === Role.DOCTOR) {
      await notifyRoles(FRONT_DESK_ROLES, { ...notification, link: `${PORTAL_TOKEN}/appointments` });
    } else if (doctorId) {
      await notifyUsers([doctorId], { ...notification, link: `/doctor/appointments/${id}` }, user.id);
    }
  }

  refresh();
  return { ok: true };
}

/** Texts the patient (and the doctor, when the front desk changed their appointment) about a status change. */
async function sendStatusSms(
  appt: { id: string; patientId: string; startsAt: Date; title: string; visitType: VisitType; patient: { firstName: string; lastName: string }; hospital: { name: string } | null },
  status: AppointmentStatus,
  doctorId: string | null,
  doctor: { firstName: string; lastName: string } | null,
  byFrontDesk: boolean
) {
  const messages: Parameters<typeof queueSms>[0] = [];
  const patient = { userId: appt.patientId };

  if (status === "CONFIRMED") {
    messages.push({ ...patient, category: "APPOINTMENT_CONFIRMED", body: sms.appointmentConfirmed(appt.patient, appt, doctor, appt.hospital?.name) });
    if (byFrontDesk && doctorId) {
      messages.push({ userId: doctorId, category: "APPOINTMENT_ASSIGNED", body: sms.doctorAssigned(appt.patient, appt) });
    }
  } else if (status === "REJECTED") {
    messages.push({ ...patient, category: "APPOINTMENT_REJECTED", body: sms.appointmentRejected(appt.patient, appt) });
  } else if (status === "CANCELLED") {
    messages.push({ ...patient, category: "APPOINTMENT_CANCELLED", body: sms.appointmentCancelled(appt.patient, appt) });
    if (byFrontDesk && doctorId) {
      messages.push({ userId: doctorId, category: "APPOINTMENT_CANCELLED", body: sms.doctorCancelled(appt.patient, appt) });
    }
  }

  await queueSms(messages);
}

export async function scheduleAppointment(formData: FormData): Promise<ActionResult> {
  const user = await authorize(Role.DOCTOR, ...FRONT_DESK_ROLES);
  if (!user) return { ok: false, error: "You are not allowed to do that." };

  const patientId = String(formData.get("patientId") ?? "");
  // Doctors always schedule for themselves.
  const doctorId = user.role === Role.DOCTOR ? user.id : String(formData.get("doctorId") ?? "") || null;
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "");
  const visitType = String(formData.get("visitType") ?? "") as VisitType;
  const title = String(formData.get("title") ?? "").trim() || "Consultation";

  if (!patientId || !date || !time) return { ok: false, error: "Patient, date and time are required." };
  if (!Object.values(VisitType).includes(visitType)) return { ok: false, error: "Invalid visit type." };

  const startsAt = new Date(`${date}T${time}`);
  if (isNaN(startsAt.getTime())) return { ok: false, error: "Invalid date or time." };

  const [patient, doctor] = await Promise.all([
    prisma.user.findFirst({ where: { id: patientId, role: Role.PATIENT, isActive: true } }),
    doctorId ? prisma.user.findFirst({ where: { id: doctorId, role: Role.DOCTOR, isActive: true } }) : null,
  ]);
  if (!patient) return { ok: false, error: "Patient not found." };
  if (doctorId && !doctor) return { ok: false, error: "Doctor not found or inactive." };

  const appt = await prisma.appointment.create({
    data: {
      title,
      patientId,
      doctorId,
      hospitalId: doctor?.hospitalId ?? null,
      startsAt,
      visitType,
      // Appointments scheduled with a doctor are confirmed straight away.
      status: doctorId ? AppointmentStatus.CONFIRMED : AppointmentStatus.PENDING,
    },
  });

  const hospital = doctor?.hospitalId
    ? await prisma.hospital.findUnique({ where: { id: doctor.hospitalId }, select: { name: true } })
    : null;
  await queueSms([
    doctor
      ? { userId: patientId, category: "APPOINTMENT_CONFIRMED", body: sms.appointmentConfirmed(patient, appt, doctor, hospital?.name) }
      : { userId: patientId, category: "APPOINTMENT_REQUESTED", body: sms.appointmentRequested(patient, appt) },
    ...(doctor && user.role !== Role.DOCTOR
      ? [{ userId: doctor.id, category: "APPOINTMENT_ASSIGNED" as const, body: sms.doctorAssigned(patient, appt) }]
      : []),
  ]);

  const patientName = `${patient.firstName} ${patient.lastName}`;
  if (!doctorId) {
    await notifyRoles([Role.DOCTOR], {
      type: "APPOINTMENT_REQUEST",
      title: "New appointment request",
      body: `${patientName} · ${title} · ${when(startsAt)}`,
      link: "/doctor/appointments",
    });
  } else if (user.role !== Role.DOCTOR) {
    await notifyUsers([doctorId], {
      type: "APPOINTMENT_ASSIGNED",
      title: "New appointment assigned to you",
      body: `${patientName} · ${title} · ${when(startsAt)}`,
      link: `/doctor/appointments/${appt.id}`,
    });
  } else {
    await notifyRoles(FRONT_DESK_ROLES, {
      type: "APPOINTMENT_CONFIRMED",
      title: "Appointment scheduled",
      body: `Dr. ${user.firstName} ${user.lastName} scheduled ${patientName} for ${when(startsAt)}.`,
      link: `${PORTAL_TOKEN}/appointments`,
    });
  }

  refresh();
  return { ok: true };
}
