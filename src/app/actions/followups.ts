"use server";

import { revalidatePath } from "next/cache";
import { Role, TestKind, Urgency, type DiagnosticTest, type Referral, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/auth";
import { type ActionResult, DENIED, enumValue, fail, text } from "@/lib/form";
import {
  assignNavigator,
  cancelReferral,
  cancelTest,
  closeLoop,
  communicateResult,
  createReferral,
  markAttended,
  markCollected,
  orderTest,
  recordReport,
  recordResult,
  reviewResult,
  scheduleReferral,
  textInstructions,
  updateNavigation,
} from "@/lib/followups";

/** Everyone who works on follow-ups. Pharmacists and patients don't. */
const CARE_TEAM: Role[] = [Role.ADMIN, Role.DOCTOR, Role.NURSE, Role.RECEPTIONIST];
const MOVED = "This has moved on since you opened it. Refresh and try again.";
const refresh = () => revalidatePath("/", "layout");

const clip = (formData: FormData, key: string, max: number) => text(formData, key)?.slice(0, max) ?? null;

/** A date-time from a datetime-local or date input; undefined when given but invalid. */
function when(formData: FormData, key: string): Date | null | undefined {
  const value = text(formData, key);
  if (!value) return null;
  const d = new Date(value.length === 10 ? `${value}T12:00` : value);
  return isNaN(d.getTime()) ? undefined : d;
}

// ---- Tests --------------------------------------------------------------------------------------

export async function orderTestAction(formData: FormData): Promise<ActionResult> {
  const doctor = await authorize(Role.DOCTOR);
  if (!doctor) return DENIED;
  const patientId = text(formData, "patientId");
  const patient = patientId ? await prisma.user.findFirst({ where: { id: patientId, role: Role.PATIENT } }) : null;
  if (!patient) return fail("Patient not found.");
  const name = clip(formData, "name", 120);
  if (!name) return fail("Enter the test name.");
  const kind = enumValue(formData, "kind", Object.values(TestKind));
  const urgency = enumValue(formData, "urgency", Object.values(Urgency));
  if (!kind || !urgency) return fail("Choose the kind of test and how urgent it is.");
  const dueAt = when(formData, "dueAt");
  if (dueAt === undefined) return fail("Enter a valid date for the result.");

  const test = await orderTest({ patientId: patient.id, doctor, name, kind, urgency, question: clip(formData, "question", 500), dueAt, recordId: text(formData, "recordId") });
  refresh();
  return { ok: true, id: test.id };
}

/** Who may do each step on a test. */
function mayActOnTest(user: User, test: DiagnosticTest, action: string) {
  const orderer = user.id === test.orderedById || user.role === Role.ADMIN;
  switch (action) {
    case "collect":
    case "result":
      return user.role === Role.DOCTOR || user.role === Role.NURSE || user.role === Role.ADMIN;
    case "communicate":
      return orderer || user.role === Role.NURSE;
    case "review":
    case "cancel":
      return orderer;
    default:
      return false;
  }
}

export async function updateTestAction(id: string, action: "collect" | "result" | "review" | "communicate" | "cancel", formData: FormData): Promise<ActionResult> {
  const user = await authorize(...CARE_TEAM);
  if (!user) return DENIED;
  const test = await prisma.diagnosticTest.findUnique({ where: { id } });
  if (!test) return fail("Test not found.");
  if (!mayActOnTest(user, test, action)) return DENIED;

  let done = false;
  if (action === "collect") done = await markCollected(test, user);
  else if (action === "result") {
    const result = clip(formData, "result", 4000);
    if (!result) return fail("Enter the result.");
    done = await recordResult(test, user, result, formData.get("abnormal") === "on");
  } else if (action === "review") done = await reviewResult(test, user, clip(formData, "reviewNote", 1000), formData.get("abnormal") === "on");
  else if (action === "communicate") done = await communicateResult(test, user, clip(formData, "how", 200));
  else {
    const reason = clip(formData, "reason", 300);
    if (!reason) return fail("Say why it's cancelled.");
    done = await cancelTest(test, user, reason);
  }
  if (!done) return fail(MOVED);
  refresh();
  return { ok: true };
}

// ---- Referrals ----------------------------------------------------------------------------------

export async function createReferralAction(formData: FormData): Promise<ActionResult> {
  const doctor = await authorize(Role.DOCTOR);
  if (!doctor) return DENIED;
  const patientId = text(formData, "patientId");
  const patient = patientId ? await prisma.user.findFirst({ where: { id: patientId, role: Role.PATIENT } }) : null;
  if (!patient) return fail("Patient not found.");

  const toDoctorId = text(formData, "toDoctorId");
  const toFacility = clip(formData, "toFacility", 200);
  if (!toDoctorId && !toFacility) return fail("Choose a MiDokta doctor, or name the facility outside MiDokta.");
  if (toDoctorId) {
    if (toDoctorId === doctor.id) return fail("You can't refer a patient to yourself.");
    if (!(await prisma.user.count({ where: { id: toDoctorId, role: Role.DOCTOR, isActive: true } }))) return fail("That doctor isn't available.");
  }
  const specialty = clip(formData, "specialty", 80);
  const reason = clip(formData, "reason", 1000);
  if (!specialty || !reason) return fail("Enter the specialty and the reason for the referral.");
  const urgency = enumValue(formData, "urgency", Object.values(Urgency));
  if (!urgency) return fail("Choose how urgent it is.");
  const navigatorId = text(formData, "navigatorId");
  if (navigatorId && !(await prisma.user.count({ where: { id: navigatorId, role: { in: [Role.NURSE, Role.RECEPTIONIST, Role.ADMIN] }, isActive: true } }))) {
    return fail("That navigator isn't available.");
  }

  const referral = await createReferral({
    patientId: patient.id,
    doctor,
    toDoctorId: toDoctorId ?? null,
    toFacility: toDoctorId ? null : toFacility,
    specialty,
    reason,
    urgency,
    patientInstructions: clip(formData, "patientInstructions", 600),
    navigatorId: navigatorId ?? null,
    recordId: text(formData, "recordId"),
  });
  refresh();
  return { ok: true, id: referral.id };
}

/** Navigators (nurses, receptionists, admins) and the doctors on the referral work it; closing the loop is the referring doctor's. */
function mayActOnReferral(user: User, r: Referral, action: string) {
  const referrer = user.id === r.referredById || user.role === Role.ADMIN;
  const navigator = user.role === Role.NURSE || user.role === Role.RECEPTIONIST || user.role === Role.ADMIN;
  if (action === "close") return referrer;
  if (action === "cancel") return referrer || user.id === r.navigatorId;
  return referrer || navigator || user.id === r.toDoctorId;
}

type ReferralAction = "assign" | "navigate" | "text" | "schedule" | "attended" | "missed" | "report" | "close" | "cancel";

export async function updateReferralAction(id: string, action: ReferralAction, formData: FormData): Promise<ActionResult> {
  const user = await authorize(...CARE_TEAM);
  if (!user) return DENIED;
  const r = await prisma.referral.findUnique({ where: { id } });
  if (!r) return fail("Referral not found.");
  if (!mayActOnReferral(user, r, action)) return DENIED;
  if (r.status === "CLOSED" || r.status === "CANCELLED") return fail("This referral is finished.");

  let done = true;
  switch (action) {
    case "assign": {
      const navigatorId = text(formData, "navigatorId");
      if (!navigatorId || !(await prisma.user.count({ where: { id: navigatorId, role: { in: [Role.NURSE, Role.RECEPTIONIST, Role.ADMIN] }, isActive: true } }))) {
        return fail("Choose a nurse or receptionist.");
      }
      await assignNavigator(r, user, navigatorId);
      break;
    }
    case "navigate": {
      const nextStepDue = when(formData, "nextStepDue");
      if (nextStepDue === undefined) return fail("Enter a valid date for the next step.");
      await updateNavigation(r, user, {
        contact: clip(formData, "contact", 1000),
        nextStep: clip(formData, "nextStep", 300),
        nextStepDue,
        patientInstructions: clip(formData, "patientInstructions", 600),
      });
      break;
    }
    case "text":
      if (!r.patientInstructions && !r.appointmentAt) return fail("Add the patient's instructions or the appointment date first.");
      if (!(await textInstructions(r, user))) return fail("The text couldn't be sent: the patient has no valid phone number or has turned texts off.");
      break;
    case "schedule": {
      const appointmentAt = when(formData, "appointmentAt");
      if (!appointmentAt) return fail("Enter the appointment date and time.");
      done = await scheduleReferral(r, user, appointmentAt);
      break;
    }
    case "attended":
    case "missed":
      done = await markAttended(r, user, action === "attended");
      break;
    case "report": {
      const summary = clip(formData, "reportSummary", 4000);
      if (!summary) return fail("Summarise what the specialist found.");
      done = await recordReport(r, user, summary);
      break;
    }
    case "close": {
      const note = clip(formData, "closureNote", 2000);
      if (!note) return fail("Document the outcome to close the loop.");
      done = await closeLoop(r, user, note);
      break;
    }
    case "cancel": {
      const reason = clip(formData, "reason", 300);
      if (!reason) return fail("Say why it's cancelled.");
      done = await cancelReferral(r, user, reason);
      break;
    }
  }
  if (!done) return fail(MOVED);
  refresh();
  return { ok: true };
}
