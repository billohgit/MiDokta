"use server";

import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/auth";
import { type ActionResult, DENIED, fail } from "@/lib/form";
import { queueSms } from "@/lib/sms";
import { sms } from "@/lib/sms/templates";
import { ensureRoom, patientLink, videoConfigured } from "@/lib/video";

/** The doctor's own confirmed video appointment, or an error message. */
async function ownVideoAppointment(id: string, doctorId: string) {
  const appt = await prisma.appointment.findFirst({
    where: { id, doctorId },
    include: { patient: true, doctor: true },
  });
  if (!appt) return "Appointment not found.";
  if (appt.visitType !== "VIDEO_CALL") return "This isn't a video appointment.";
  if (appt.status !== "CONFIRMED") return "Only confirmed appointments can have a video call.";
  if (!videoConfigured()) return "Video calls aren't set up yet. Add DAILY_API_KEY to the server settings.";
  return appt;
}

async function textLink(appt: Exclude<Awaited<ReturnType<typeof ownVideoAppointment>>, string>, key: string, sentById: string) {
  const link = await patientLink(key);
  const { queued } = await queueSms({
    userId: appt.patientId,
    category: "VIDEO_CALL",
    body: sms.videoCallLink(appt.patient, appt.doctor, link),
    sentById,
  });
  return queued > 0;
}

/** Opens the room for a checked appointment, texting the patient their link the first time. */
async function openRoom(appt: Exclude<Awaited<ReturnType<typeof ownVideoAppointment>>, string>, doctorId: string) {
  const firstStart = !appt.videoPatientKey;
  let updated;
  try {
    updated = await ensureRoom(appt);
  } catch (e) {
    console.error("Creating video room failed", e);
    return fail("The video room couldn't be created. Check DAILY_API_KEY and try again.");
  }
  const texted = firstStart ? await textLink(appt, updated.videoPatientKey!, doctorId) : true;
  return { ok: true as const, id: appt.id, texted };
}

/**
 * Opens the video room for an appointment. The first time, the patient is texted their join
 * link. Returns `texted: false` when the SMS couldn't go out, so the doctor can share it another way.
 */
export async function startVideoCall(id: string): Promise<ActionResult & { texted?: boolean }> {
  const me = await authorize(Role.DOCTOR);
  if (!me) return DENIED;
  const appt = await ownVideoAppointment(id, me.id);
  if (typeof appt === "string") return fail(appt);
  return openRoom(appt, me.id);
}

/** A video appointment counts as "now" from this long before its start to this long after. */
const NOW_WINDOW_BEFORE_MS = 60 * 60 * 1000;
const NOW_WINDOW_AFTER_MS = 3 * 60 * 60 * 1000;

/**
 * Starts a video visit with a patient straight away (from chat). Reuses the doctor's confirmed
 * video appointment with them around now, or books one for now, so the visit is on record.
 */
export async function startInstantVideoCall(patientId: string): Promise<ActionResult & { texted?: boolean }> {
  const me = await authorize(Role.DOCTOR);
  if (!me) return DENIED;
  if (!videoConfigured()) return fail("Video calls aren't set up yet. Add DAILY_API_KEY to the server settings.");
  const patient = await prisma.user.findFirst({ where: { id: patientId, role: Role.PATIENT } });
  if (!patient) return fail("Patient not found.");

  const now = Date.now();
  const existing = await prisma.appointment.findFirst({
    where: {
      doctorId: me.id,
      patientId,
      visitType: "VIDEO_CALL",
      status: "CONFIRMED",
      startsAt: { gte: new Date(now - NOW_WINDOW_AFTER_MS), lte: new Date(now + NOW_WINDOW_BEFORE_MS) },
    },
    orderBy: { startsAt: "desc" },
  });
  const id =
    existing?.id ??
    (
      await prisma.appointment.create({
        data: {
          title: "Video visit",
          startsAt: new Date(now),
          status: "CONFIRMED",
          visitType: "VIDEO_CALL",
          doctorId: me.id,
          patientId,
          hospitalId: me.hospitalId,
        },
      })
    ).id;

  const appt = await ownVideoAppointment(id, me.id);
  if (typeof appt === "string") return fail(appt);
  return openRoom(appt, me.id);
}

export async function resendVideoLink(id: string): Promise<ActionResult> {
  const me = await authorize(Role.DOCTOR);
  if (!me) return DENIED;
  const appt = await ownVideoAppointment(id, me.id);
  if (typeof appt === "string") return fail(appt);
  if (!appt.videoPatientKey) return fail("Start the call first.");

  if (!(await textLink(appt, appt.videoPatientKey, me.id))) {
    return fail("The text couldn't be sent: the patient has no valid phone number or has turned off texts. Copy the link instead.");
  }
  return { ok: true };
}
