"use server";

import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/auth";
import { type ActionResult, DENIED, fail } from "@/lib/form";
import { CALL_ROLES } from "@/lib/roles";
import {
  NOT_SET_UP,
  callName,
  canCall,
  createRoom,
  currentVideoAppointment,
  expireStaleCalls,
  isBusy,
  videoConfigured,
  visitForCall,
} from "@/lib/calls";

/**
 * Rings `calleeId` in the app. `appointmentId` ties the call to the visit it was placed from; without
 * it, the pair's video appointment around now is used. Returns the call's id for the call screen.
 */
export async function startCall(calleeId: string, appointmentId?: string): Promise<ActionResult> {
  const me = await authorize(...CALL_ROLES);
  if (!me) return DENIED;
  if (!videoConfigured()) return fail(me.role === Role.DOCTOR ? NOT_SET_UP : "Video calls aren't available right now. Please contact the clinic.");

  const callee = await prisma.user.findUnique({ where: { id: calleeId } });
  if (!callee || !(await canCall(me, callee))) return fail("You can only video call your own doctors and patients.");

  const [doctorId, patientId] = me.role === Role.DOCTOR ? [me.id, callee.id] : [callee.id, me.id];
  let visitId: string | null = null;
  if (appointmentId) {
    const appt = await prisma.appointment.findFirst({ where: { id: appointmentId, doctorId, patientId }, select: { id: true } });
    if (!appt) return fail("Appointment not found.");
    visitId = appt.id;
  } else {
    visitId = (await currentVideoAppointment(doctorId, patientId))?.id ?? null;
  }

  // Clear out calls that ended without anyone hanging up, so they don't count as "busy".
  await Promise.all([expireStaleCalls(me.id), expireStaleCalls(callee.id)]);
  if (await isBusy(me.id)) return fail("You're already on a call. Hang up first.");
  if (await isBusy(callee.id)) return fail(`${callName(callee)} is on another call. Try again in a few minutes.`);

  let room;
  try {
    room = await createRoom();
  } catch (e) {
    console.error("Creating video room failed", e);
    return fail("The call couldn't be started. Please try again in a moment.");
  }

  const call = await prisma.call.create({
    data: { callerId: me.id, calleeId: callee.id, appointmentId: visitId, ...room },
  });
  return { ok: true, id: call.id };
}

/** The signed-in user's side of a call, or null if they aren't on it. */
async function myCall(id: string) {
  const me = await authorize(...CALL_ROLES);
  if (!me) return null;
  const call = await prisma.call.findUnique({ where: { id }, include: { caller: true, callee: true } });
  if (!call || (call.callerId !== me.id && call.calleeId !== me.id)) return null;
  return { me, call };
}

/** Picks up a ringing call. The call is filed under a visit so the doctor can write it up. */
export async function answerCall(id: string): Promise<ActionResult> {
  const mine = await myCall(id);
  if (!mine || mine.call.calleeId !== mine.me.id) return DENIED;
  const { call } = mine;

  await expireStaleCalls(mine.me.id);
  const now = new Date();
  const { count } = await prisma.call.updateMany({
    where: { id, status: "RINGING" },
    data: { status: "ACCEPTED", answeredAt: now, calleeSeenAt: now },
  });
  if (!count) return fail("This call has ended.");

  const doctor = call.caller.role === Role.DOCTOR ? call.caller : call.callee;
  const patient = call.caller.role === Role.PATIENT ? call.caller : call.callee;
  const appointmentId = await visitForCall(call, doctor, patient.id);
  if (appointmentId !== call.appointmentId) await prisma.call.update({ where: { id }, data: { appointmentId } });
  return { ok: true, id };
}

export async function declineCall(id: string): Promise<ActionResult> {
  const mine = await myCall(id);
  if (!mine || mine.call.calleeId !== mine.me.id) return DENIED;
  await prisma.call.updateMany({ where: { id, status: "RINGING" }, data: { status: "DECLINED", endedAt: new Date() } });
  return { ok: true };
}

/** Hangs up: cancels a call that's still ringing, or ends a connected one for both sides. */
export async function hangUp(id: string): Promise<ActionResult> {
  const mine = await myCall(id);
  if (!mine) return DENIED;
  const endedAt = new Date();
  if (mine.call.callerId === mine.me.id) {
    await prisma.call.updateMany({ where: { id, status: "RINGING" }, data: { status: "CANCELLED", endedAt } });
  }
  await prisma.call.updateMany({ where: { id, status: "ACCEPTED" }, data: { status: "ENDED", endedAt } });
  return { ok: true };
}
