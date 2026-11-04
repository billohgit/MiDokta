import "server-only";

import { Role, type DiagnosticTest, type Referral, type TestKind, type Urgency, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PORTAL_TOKEN, notifyUsers, notifyUsersOnce } from "@/lib/notifications";
import { queueSms } from "@/lib/sms";
import { SMS_BRAND } from "@/lib/sms/templates";
import { formatDate, formatTime } from "@/components/appointments/shared";

/**
 * Follow-up tracking for what happens after a consultation, so nothing is lost between visits:
 *
 * - Diagnostic tests: ordered -> sample collected -> result in -> reviewed by the ordering doctor
 *   -> patient told. Each step has a time limit; past it, the test is flagged and the person who
 *   should act is alerted once.
 * - Referrals: referred -> appointment booked -> attended -> specialist's report back -> loop closed
 *   by the referring doctor with a documented outcome. A care navigator (nurse or receptionist)
 *   works the referral with the patient: calls, next steps, instructions texted to them.
 *
 * Every change is written to the item's timeline (CareEvent), which is the record of the loop.
 */

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** How long a result should take, by test kind and urgency. Sets the default due date. */
const RESULT_WITHIN: Record<TestKind, Record<Urgency, number>> = {
  LAB: { ROUTINE: 3 * DAY, URGENT: DAY, EMERGENCY: 6 * HOUR },
  IMAGING: { ROUTINE: 7 * DAY, URGENT: 2 * DAY, EMERGENCY: 6 * HOUR },
  OTHER: { ROUTINE: 7 * DAY, URGENT: 2 * DAY, EMERGENCY: 6 * HOUR },
};
/** How long a result may wait for the doctor's review, and then for the patient to be told. */
const REVIEW_WITHIN: Record<Urgency, number> = { ROUTINE: 2 * DAY, URGENT: DAY, EMERGENCY: 2 * HOUR };
const TELL_WITHIN: Record<Urgency, number> = { ROUTINE: 2 * DAY, URGENT: DAY, EMERGENCY: 4 * HOUR };
/** How long a referral may wait to be booked, and then for the specialist's report. */
const SCHEDULE_WITHIN: Record<Urgency, number> = { ROUTINE: 14 * DAY, URGENT: 3 * DAY, EMERGENCY: 12 * HOUR };
const REPORT_WITHIN: Record<Urgency, number> = { ROUTINE: 14 * DAY, URGENT: 7 * DAY, EMERGENCY: 2 * DAY };
/** After the appointment date, how long before missing attendance is flagged. */
const ATTENDANCE_GRACE = DAY;
const CLOSE_WITHIN = 7 * DAY;

export const defaultTestDue = (kind: TestKind, urgency: Urgency, from = new Date()) => new Date(from.getTime() + RESULT_WITHIN[kind][urgency]);

export type Delay = { rule: string; text: string };

/** What is late about a test right now, if anything. */
export function testDelay(t: Pick<DiagnosticTest, "status" | "urgency" | "dueAt" | "resultedAt" | "reviewedAt">, now = new Date()): Delay | null {
  const ms = now.getTime();
  if ((t.status === "ORDERED" || t.status === "COLLECTED") && ms > t.dueAt.getTime()) {
    return { rule: "result-overdue", text: `Result overdue since ${formatDate(t.dueAt.toISOString())}` };
  }
  if (t.status === "RESULTED" && t.resultedAt && ms > t.resultedAt.getTime() + REVIEW_WITHIN[t.urgency]) {
    return { rule: "review-overdue", text: "Result waiting for the doctor's review" };
  }
  if (t.status === "REVIEWED" && t.reviewedAt && ms > t.reviewedAt.getTime() + TELL_WITHIN[t.urgency]) {
    return { rule: "tell-overdue", text: "Patient not told the result yet" };
  }
  return null;
}

/** What is late about a referral right now, if anything. */
export function referralDelay(
  r: Pick<Referral, "status" | "urgency" | "createdAt" | "appointmentAt" | "attendedAt" | "reportReceivedAt" | "nextStepDue">,
  now = new Date(),
): Delay | null {
  const ms = now.getTime();
  if (r.status === "CREATED" && ms > r.createdAt.getTime() + SCHEDULE_WITHIN[r.urgency]) {
    return { rule: "not-scheduled", text: "No appointment booked yet" };
  }
  if (r.status === "SCHEDULED" && r.appointmentAt && ms > r.appointmentAt.getTime() + ATTENDANCE_GRACE) {
    return { rule: "attendance-unknown", text: "Appointment date passed: did the patient go?" };
  }
  if (r.status === "ATTENDED" && r.attendedAt && ms > r.attendedAt.getTime() + REPORT_WITHIN[r.urgency]) {
    return { rule: "report-overdue", text: "No report from the specialist yet" };
  }
  if (r.status === "REPORT_RECEIVED" && r.reportReceivedAt && ms > r.reportReceivedAt.getTime() + CLOSE_WITHIN) {
    return { rule: "loop-open", text: "Report back: loop not closed" };
  }
  if (r.status !== "CLOSED" && r.status !== "CANCELLED" && r.nextStepDue && ms > r.nextStepDue.getTime()) {
    return { rule: "next-step-overdue", text: "Navigator's next step is overdue" };
  }
  return null;
}

export const isTestOpen = (t: Pick<DiagnosticTest, "status">) => t.status !== "COMMUNICATED" && t.status !== "CANCELLED";
export const isReferralOpen = (r: Pick<Referral, "status">) => r.status !== "CLOSED" && r.status !== "CANCELLED";

export const referralTarget = (r: Pick<Referral, "toFacility"> & { toDoctor: Pick<User, "firstName" | "lastName"> | null }) =>
  r.toDoctor ? `Dr. ${r.toDoctor.firstName} ${r.toDoctor.lastName}` : (r.toFacility ?? "a specialist");

const at = (d: Date) => `${formatDate(d.toISOString())} at ${formatTime(d.toISOString())}`;

// ---- Timeline -----------------------------------------------------------------------------------

type EventInput = { testId?: string; referralId?: string; actorId?: string | null; kind: "STATUS" | "NOTE" | "CONTACT" | "SMS" | "ALERT"; text: string };

export const logEvent = (e: EventInput) => prisma.careEvent.create({ data: { ...e, text: e.text.slice(0, 1000) } });

/** Moves an item from one of `from` to the next status, unless someone moved it first. */
async function moveTest(id: string, from: DiagnosticTest["status"][], data: Parameters<typeof prisma.diagnosticTest.updateMany>[0]["data"]) {
  const { count } = await prisma.diagnosticTest.updateMany({ where: { id, status: { in: from } }, data });
  return count === 1;
}
async function moveReferral(id: string, from: Referral["status"][], data: Parameters<typeof prisma.referral.updateMany>[0]["data"]) {
  const { count } = await prisma.referral.updateMany({ where: { id, status: { in: from } }, data });
  return count === 1;
}

// ---- Tests --------------------------------------------------------------------------------------

type NewTest = { patientId: string; doctor: User; name: string; kind: TestKind; urgency: Urgency; question: string | null; dueAt: Date | null; recordId: string | null };

export async function orderTest(n: NewTest): Promise<DiagnosticTest> {
  const test = await prisma.diagnosticTest.create({
    data: {
      patientId: n.patientId,
      orderedById: n.doctor.id,
      recordId: n.recordId,
      name: n.name,
      kind: n.kind,
      urgency: n.urgency,
      question: n.question,
      dueAt: n.dueAt ?? defaultTestDue(n.kind, n.urgency),
    },
  });
  await logEvent({ testId: test.id, actorId: n.doctor.id, kind: "STATUS", text: `Ordered by Dr. ${n.doctor.firstName} ${n.doctor.lastName} (${n.urgency.toLowerCase()})` });
  if (n.urgency !== "ROUTINE") {
    await notifyRolesForUrgent(test, `${n.urgency === "EMERGENCY" ? "Emergency" : "Urgent"} test ordered: ${n.name}`);
  }
  return test;
}

async function notifyRolesForUrgent(test: DiagnosticTest, title: string) {
  const nurses = await prisma.user.findMany({ where: { role: Role.NURSE, isActive: true }, select: { id: true } });
  await notifyUsers(
    nurses.map((n) => n.id),
    { type: "GENERAL", title, body: "Please arrange the sample or scan.", link: `${PORTAL_TOKEN}/follow-ups/tests/${test.id}` },
  );
}

export async function markCollected(test: DiagnosticTest, actor: User) {
  if (!(await moveTest(test.id, ["ORDERED"], { status: "COLLECTED", collectedAt: new Date() }))) return false;
  await logEvent({ testId: test.id, actorId: actor.id, kind: "STATUS", text: test.kind === "LAB" ? "Sample collected" : "Done; waiting for the report" });
  return true;
}

export async function recordResult(test: DiagnosticTest, actor: User, result: string, abnormal: boolean) {
  if (!(await moveTest(test.id, ["ORDERED", "COLLECTED"], { status: "RESULTED", result, abnormal, resultedAt: new Date(), resultById: actor.id, collectedAt: test.collectedAt ?? new Date() }))) {
    return false;
  }
  await logEvent({ testId: test.id, actorId: actor.id, kind: "STATUS", text: `Result entered${abnormal ? " (flagged abnormal)" : ""}` });
  await notifyUsers(
    [test.orderedById],
    {
      type: "GENERAL",
      title: abnormal ? `Abnormal result: ${test.name}` : `Result ready to review: ${test.name}`,
      body: "Review it and tell the patient.",
      link: `/doctor/follow-ups/tests/${test.id}`,
    },
    actor.id,
  );
  return true;
}

export async function reviewResult(test: DiagnosticTest, actor: User, note: string | null, abnormal: boolean) {
  if (!(await moveTest(test.id, ["RESULTED"], { status: "REVIEWED", reviewNote: note, abnormal, reviewedAt: new Date() }))) return false;
  await logEvent({ testId: test.id, actorId: actor.id, kind: "STATUS", text: `Reviewed${abnormal ? ", abnormal" : ", normal"}${note ? `: ${note}` : ""}` });
  return true;
}

/** Tells the patient their result is ready (by text and in their records). Never texts the result itself. */
export async function communicateResult(test: DiagnosticTest, actor: User, how: string | null) {
  if (!(await moveTest(test.id, ["REVIEWED"], { status: "COMMUNICATED", communicatedAt: new Date() }))) return false;
  const patient = await prisma.user.findUniqueOrThrow({ where: { id: test.patientId } });
  const ask = test.abnormal ? "Please contact the clinic to talk it through with your doctor." : "Sign in to MiDokta to read it.";
  const { queued } = await queueSms({
    userId: patient.id,
    category: "FOLLOW_UP_REMINDER",
    body: `${SMS_BRAND}: Hi ${patient.firstName}, your ${test.name} result is ready. ${ask}`,
    sentById: actor.id,
  });
  await notifyUsers([patient.id], { type: "GENERAL", title: `Your ${test.name} result is ready`, link: "/patient/records" });
  await logEvent({ testId: test.id, actorId: actor.id, kind: "STATUS", text: `Patient told${how ? ` (${how})` : ""}${queued ? "; text sent" : "; no text sent (no valid phone or texts turned off)"}` });
  return true;
}

export async function cancelTest(test: DiagnosticTest, actor: User, reason: string) {
  if (!(await moveTest(test.id, ["ORDERED", "COLLECTED", "RESULTED", "REVIEWED"], { status: "CANCELLED", cancelledAt: new Date() }))) return false;
  await logEvent({ testId: test.id, actorId: actor.id, kind: "STATUS", text: `Cancelled: ${reason}` });
  return true;
}

// ---- Referrals ----------------------------------------------------------------------------------

type NewReferral = {
  patientId: string;
  doctor: User;
  toDoctorId: string | null;
  toFacility: string | null;
  specialty: string;
  reason: string;
  urgency: Urgency;
  patientInstructions: string | null;
  navigatorId: string | null;
  recordId: string | null;
};

export async function createReferral(n: NewReferral) {
  const referral = await prisma.referral.create({
    data: {
      patientId: n.patientId,
      referredById: n.doctor.id,
      recordId: n.recordId,
      toDoctorId: n.toDoctorId,
      toFacility: n.toFacility,
      specialty: n.specialty,
      reason: n.reason,
      urgency: n.urgency,
      patientInstructions: n.patientInstructions,
      navigatorId: n.navigatorId,
    },
    include: { toDoctor: true, patient: true },
  });
  await logEvent({ referralId: referral.id, actorId: n.doctor.id, kind: "STATUS", text: `Referred to ${referralTarget(referral)} (${n.specialty}, ${n.urgency.toLowerCase()})` });

  const link = `${PORTAL_TOKEN}/follow-ups/referrals/${referral.id}`;
  const title = `${n.urgency === "ROUTINE" ? "New" : n.urgency === "URGENT" ? "Urgent" : "Emergency"} referral: ${referral.patient.firstName} ${referral.patient.lastName} to ${n.specialty}`;
  // The navigator (or, with none assigned, every nurse and receptionist) arranges it.
  const navigators = n.navigatorId
    ? [n.navigatorId]
    : (await prisma.user.findMany({ where: { role: { in: [Role.NURSE, Role.RECEPTIONIST] }, isActive: true }, select: { id: true } })).map((u) => u.id);
  await notifyUsers(navigators, { type: "GENERAL", title, body: n.reason, link }, n.doctor.id);
  if (n.toDoctorId) await notifyUsers([n.toDoctorId], { type: "GENERAL", title: `Referral to you from Dr. ${n.doctor.lastName}`, body: n.reason, link: `/doctor/follow-ups/referrals/${referral.id}` });
  return referral;
}

export async function assignNavigator(r: Referral, actor: User, navigatorId: string) {
  await prisma.referral.update({ where: { id: r.id }, data: { navigatorId } });
  const nav = await prisma.user.findUniqueOrThrow({ where: { id: navigatorId } });
  await logEvent({ referralId: r.id, actorId: actor.id, kind: "NOTE", text: `${nav.firstName} ${nav.lastName} is now the care navigator` });
  await notifyUsers([navigatorId], { type: "GENERAL", title: "You're navigating a referral", link: `${PORTAL_TOKEN}/follow-ups/referrals/${r.id}` }, actor.id);
}

/** The navigator logs a contact with the patient and/or sets the next step and the patient's instructions. */
export async function updateNavigation(
  r: Referral,
  actor: User,
  u: { contact: string | null; nextStep: string | null; nextStepDue: Date | null; patientInstructions: string | null },
) {
  await prisma.referral.update({ where: { id: r.id }, data: { nextStep: u.nextStep, nextStepDue: u.nextStepDue, patientInstructions: u.patientInstructions } });
  if (u.contact) await logEvent({ referralId: r.id, actorId: actor.id, kind: "CONTACT", text: u.contact });
  if (u.nextStep !== r.nextStep && u.nextStep) {
    await logEvent({ referralId: r.id, actorId: actor.id, kind: "NOTE", text: `Next step: ${u.nextStep}${u.nextStepDue ? ` (by ${formatDate(u.nextStepDue.toISOString())})` : ""}` });
  }
  if (u.patientInstructions !== r.patientInstructions && u.patientInstructions) {
    await logEvent({ referralId: r.id, actorId: actor.id, kind: "NOTE", text: "Patient instructions updated" });
  }
}

/** Texts the patient where to go and what to bring. */
export async function textInstructions(r: Referral, actor: User) {
  const full = await prisma.referral.findUniqueOrThrow({ where: { id: r.id }, include: { patient: true, toDoctor: true } });
  const when = full.appointmentAt ? ` Your appointment: ${at(full.appointmentAt)}.` : "";
  const body = `${SMS_BRAND}: Hi ${full.patient.firstName}, about your referral to ${referralTarget(full)}:${when} ${full.patientInstructions ?? ""}`.trim();
  const { queued } = await queueSms({ userId: full.patientId, category: "FOLLOW_UP_REMINDER", body, sentById: actor.id });
  await logEvent({ referralId: r.id, actorId: actor.id, kind: "SMS", text: queued ? `Texted the patient: "${body}"` : "Couldn't text the patient (no valid phone or texts turned off)" });
  return queued > 0;
}

/**
 * Records the booked appointment. For a referral to a MiDokta doctor, books it in the app too, so
 * the patient gets the usual reminders and the doctor sees it in their schedule.
 */
export async function scheduleReferral(r: Referral, actor: User, appointmentAt: Date) {
  const full = await prisma.referral.findUniqueOrThrow({ where: { id: r.id }, include: { toDoctor: true } });
  let appointmentId = full.appointmentId;
  if (full.toDoctor) {
    if (appointmentId) {
      await prisma.appointment.update({ where: { id: appointmentId }, data: { startsAt: appointmentAt, status: "CONFIRMED" } });
    } else {
      const appt = await prisma.appointment.create({
        data: {
          title: `Referral: ${full.specialty}`,
          notes: full.reason,
          patientId: full.patientId,
          doctorId: full.toDoctor.id,
          hospitalId: full.toDoctor.hospitalId,
          startsAt: appointmentAt,
          status: "CONFIRMED",
        },
      });
      appointmentId = appt.id;
    }
  }
  if (!(await moveReferral(r.id, ["CREATED", "SCHEDULED"], { status: "SCHEDULED", appointmentAt, scheduledAt: new Date(), appointmentId }))) return false;
  await logEvent({ referralId: r.id, actorId: actor.id, kind: "STATUS", text: `Appointment booked for ${at(appointmentAt)}${full.toDoctor ? " (in MiDokta)" : ""}` });
  return true;
}

export async function markAttended(r: Referral, actor: User, attended: boolean) {
  if (attended) {
    if (!(await moveReferral(r.id, ["SCHEDULED"], { status: "ATTENDED", attendedAt: new Date() }))) return false;
    await logEvent({ referralId: r.id, actorId: actor.id, kind: "STATUS", text: "The patient attended" });
  } else {
    // Missed: back to booking a new date.
    if (!(await moveReferral(r.id, ["SCHEDULED"], { status: "CREATED", appointmentAt: null }))) return false;
    await logEvent({ referralId: r.id, actorId: actor.id, kind: "STATUS", text: "The patient missed the appointment; needs a new date" });
  }
  return true;
}

export async function recordReport(r: Referral, actor: User, summary: string) {
  if (!(await moveReferral(r.id, ["SCHEDULED", "ATTENDED"], { status: "REPORT_RECEIVED", reportSummary: summary, reportReceivedAt: new Date(), attendedAt: r.attendedAt ?? new Date() }))) {
    return false;
  }
  await logEvent({ referralId: r.id, actorId: actor.id, kind: "STATUS", text: `Specialist's report received: ${summary}` });
  await notifyUsers([r.referredById], { type: "GENERAL", title: "Referral report back: close the loop", body: summary.slice(0, 200), link: `/doctor/follow-ups/referrals/${r.id}` }, actor.id);
  return true;
}

/** The referring doctor documents the outcome; the referral is done. */
export async function closeLoop(r: Referral, actor: User, note: string) {
  if (!(await moveReferral(r.id, ["ATTENDED", "REPORT_RECEIVED"], { status: "CLOSED", closureNote: note, closedAt: new Date(), closedById: actor.id }))) return false;
  await logEvent({ referralId: r.id, actorId: actor.id, kind: "STATUS", text: `Loop closed: ${note}` });
  return true;
}

export async function cancelReferral(r: Referral, actor: User, reason: string) {
  if (!(await moveReferral(r.id, ["CREATED", "SCHEDULED", "ATTENDED", "REPORT_RECEIVED"], { status: "CANCELLED", cancelledAt: new Date() }))) return false;
  if (r.appointmentId) await prisma.appointment.updateMany({ where: { id: r.appointmentId, status: { in: ["PENDING", "CONFIRMED"] } }, data: { status: "CANCELLED" } });
  await logEvent({ referralId: r.id, actorId: actor.id, kind: "STATUS", text: `Cancelled: ${reason}` });
  return true;
}

// ---- Delay alerts (scheduled job) ---------------------------------------------------------------

/**
 * Alerts whoever should act on each late test or referral, once per item and problem, and notes it
 * on the timeline. Run from the scheduled job.
 */
export async function syncFollowUps(now = new Date()): Promise<{ alerts: number }> {
  let alerts = 0;
  const [tests, referrals, nurses, desk] = await Promise.all([
    prisma.diagnosticTest.findMany({ where: { status: { in: ["ORDERED", "COLLECTED", "RESULTED", "REVIEWED"] } }, include: { patient: true } }),
    prisma.referral.findMany({ where: { status: { in: ["CREATED", "SCHEDULED", "ATTENDED", "REPORT_RECEIVED"] } }, include: { patient: true, toDoctor: true } }),
    prisma.user.findMany({ where: { role: Role.NURSE, isActive: true }, select: { id: true } }),
    prisma.user.findMany({ where: { role: { in: [Role.NURSE, Role.RECEPTIONIST] }, isActive: true }, select: { id: true } }),
  ]);

  for (const t of tests) {
    const delay = testDelay(t, now);
    if (!delay) continue;
    // A missing result is chased by the nurses too; review and telling the patient are the doctor's.
    const who = delay.rule === "review-overdue" ? [t.orderedById] : [t.orderedById, ...nurses.map((n) => n.id)];
    const sent = await notifyUsersOnce(
      who,
      { type: "GENERAL", title: `${delay.text}: ${t.name}`, body: `${t.patient.firstName} ${t.patient.lastName}`, link: `${PORTAL_TOKEN}/follow-ups/tests/${t.id}` },
      `followup:test:${t.id}:${delay.rule}`,
    );
    if (sent) {
      alerts++;
      await logEvent({ testId: t.id, kind: "ALERT", text: delay.text });
    }
  }

  for (const r of referrals) {
    const delay = referralDelay(r, now);
    if (!delay) continue;
    const navigators = r.navigatorId ? [r.navigatorId] : desk.map((u) => u.id);
    // Closing the loop is the referring doctor's; the rest is the navigator's, with the doctor in
    // the loop when the referral isn't routine.
    const who = delay.rule === "loop-open" ? [r.referredById] : r.urgency === "ROUTINE" ? navigators : [...navigators, r.referredById];
    const sent = await notifyUsersOnce(
      who,
      {
        type: "GENERAL",
        title: `${delay.text}: referral to ${referralTarget(r)}`,
        body: `${r.patient.firstName} ${r.patient.lastName} · ${r.specialty} · ${r.urgency.toLowerCase()}`,
        link: `${PORTAL_TOKEN}/follow-ups/referrals/${r.id}`,
      },
      // Next steps change, so their alert is keyed to the due date being chased.
      `followup:referral:${r.id}:${delay.rule}${delay.rule === "next-step-overdue" ? `:${r.nextStepDue?.getTime()}` : ""}`,
    );
    if (sent) {
      alerts++;
      await logEvent({ referralId: r.id, kind: "ALERT", text: delay.text });
    }
  }
  return { alerts };
}
