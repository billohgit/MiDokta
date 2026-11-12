"use server";

import { revalidatePath } from "next/cache";
import { MalariaTestType, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/auth";
import { type ActionResult, DENIED, checkbox, enumValue, fail, intValue, text } from "@/lib/form";
import {
  HEALTH_WORKER_ROLES,
  type PatientOutcome,
  addNote,
  approvePlan,
  cancelCase,
  closeCase,
  logDose,
  recordTest,
  reportOutcome,
  savePlan,
  saveWeeklyTipSettings,
  screenPatient,
  sendCampaign,
} from "@/lib/malaria/cases";
import { DANGER_SIGNS, FOR_WHOM, type ForWhom, SYMPTOMS } from "@/lib/malaria/screening";

const refresh = (id?: string) => {
  for (const base of ["/patient", "/doctor", "/staff", "/admin"]) {
    revalidatePath(`${base}/malaria`);
    if (id) revalidatePath(`${base}/malaria/${id}`);
  }
};

const STALE = fail("This case has moved on since you opened it. Refresh the page to see where it is now.");

// ---- Patients --------------------------------------------------------------------------------------

async function myCase(id: string) {
  const patient = await authorize(Role.PATIENT);
  if (!patient) return null;
  return prisma.malariaCase.findFirst({ where: { id, patientId: patient.id } });
}

export async function takeMalariaDose(caseId: string): Promise<ActionResult> {
  const c = await myCase(caseId);
  if (!c) return DENIED;
  if (!(await logDose(c))) return fail("There's no treatment day to tick off today.");
  refresh(c.id);
  return { ok: true };
}

export async function reportMalariaOutcome(caseId: string, outcome: PatientOutcome): Promise<ActionResult> {
  const c = await myCase(caseId);
  if (!c) return DENIED;
  if (!["BETTER", "STILL_SICK", "NOT_FINISHED"].includes(outcome)) return fail("Choose an answer.");
  if (!(await reportOutcome(c, outcome))) return STALE;
  refresh(c.id);
  return { ok: true };
}

// ---- Health workers --------------------------------------------------------------------------------

async function workerCase(formData: FormData | string, roles = HEALTH_WORKER_ROLES) {
  const worker = await authorize(...roles);
  if (!worker) return null;
  const id = typeof formData === "string" ? formData : (text(formData, "caseId") ?? "");
  const c = await prisma.malariaCase.findUnique({ where: { id } });
  return c ? { worker, c } : null;
}

export async function recordMalariaTest(formData: FormData): Promise<ActionResult> {
  const w = await workerCase(formData);
  if (!w) return DENIED;
  const type = enumValue(formData, "testType", Object.values(MalariaTestType));
  const result = text(formData, "result");
  if (!type) return fail("Choose the test used.");
  if (result !== "POSITIVE" && result !== "NEGATIVE") return fail("Choose positive or negative.");
  const ok = await recordTest(w.c, w.worker, {
    type,
    positive: result === "POSITIVE",
    species: result === "POSITIVE" ? (text(formData, "species")?.slice(0, 60) ?? null) : null,
    note: text(formData, "note")?.slice(0, 500) ?? null,
    testedAt: text(formData, "testedAt")?.slice(0, 120) ?? null,
  });
  if (!ok) return STALE;
  refresh(w.c.id);
  return { ok: true };
}

export async function saveMalariaPlan(formData: FormData): Promise<ActionResult> {
  const w = await workerCase(formData);
  if (!w) return DENIED;
  const planText = text(formData, "planText")?.slice(0, 1000);
  const days = intValue(formData, "days", 1, 14);
  const dosesPerDay = intValue(formData, "dosesPerDay", 1, 4);
  if (!planText) return fail("Write the treatment plan: medicine, dose and how long.");
  if (!days) return fail("Enter how many days the treatment lasts (1 to 14).");
  if (!dosesPerDay) return fail("Enter how many times a day (1 to 4).");
  if (!(await savePlan(w.c, w.worker, { text: planText, days, dosesPerDay }))) return STALE;
  refresh(w.c.id);
  return { ok: true };
}

export async function approveMalariaPlan(caseId: string): Promise<ActionResult> {
  const w = await workerCase(caseId, [Role.DOCTOR]);
  if (!w) return fail("Only a doctor can approve a treatment plan.");
  if (!(await approvePlan(w.c, w.worker))) return STALE;
  refresh(w.c.id);
  return { ok: true };
}

export async function addMalariaNote(formData: FormData): Promise<ActionResult> {
  const w = await workerCase(formData);
  if (!w) return DENIED;
  const note = text(formData, "note")?.slice(0, 1000);
  if (!note) return fail("Write the note.");
  await addNote(w.c, w.worker, note, checkbox(formData, "contact"));
  refresh(w.c.id);
  return { ok: true };
}

export async function closeMalariaCase(formData: FormData): Promise<ActionResult> {
  const w = await workerCase(formData);
  if (!w) return DENIED;
  const note = text(formData, "note")?.slice(0, 500);
  const outcome = text(formData, "outcome");
  if (!note) return fail("Note what you found out, e.g. from your call with the patient.");
  if (outcome !== "COMPLETED" && outcome !== "NOT_COMPLETED") return fail("Choose whether the treatment was completed.");
  if (!(await closeCase(w.c, w.worker, outcome === "COMPLETED", note))) return STALE;
  refresh(w.c.id);
  return { ok: true };
}

export async function cancelMalariaCase(formData: FormData): Promise<ActionResult> {
  const w = await workerCase(formData);
  if (!w) return DENIED;
  const reason = text(formData, "reason")?.slice(0, 500);
  if (!reason) return fail("Give a reason, e.g. opened by mistake.");
  if (!(await cancelCase(w.c, w.worker, reason))) return STALE;
  refresh(w.c.id);
  return { ok: true };
}

/** A health worker runs the malaria check with a patient in front of them (or on the phone). */
export async function screenForPatient(formData: FormData): Promise<ActionResult & { outcome?: string; score?: number }> {
  const worker = await authorize(...HEALTH_WORKER_ROLES);
  if (!worker) return DENIED;
  const patient = await prisma.user.findFirst({ where: { id: text(formData, "patientId") ?? "", role: Role.PATIENT, isActive: true } });
  if (!patient) return fail("Choose the patient.");
  const answers = Object.fromEntries(SYMPTOMS.map((q) => [q.id, checkbox(formData, `s_${q.id}`)]));
  const dangerSigns = DANGER_SIGNS.filter((d) => checkbox(formData, `d_${d.id}`)).map((d) => d.id);
  const forWhom = FOR_WHOM.find((f) => f.id === text(formData, "forWhom"))?.id ?? ("SELF" as ForWhom);
  const r = await screenPatient(patient, { answers, dangerSigns, forWhom, district: text(formData, "district"), location: null }, worker);
  refresh(r.caseId ?? undefined);
  return { ok: true, id: r.caseId ?? undefined, outcome: r.outcome, score: r.score };
}

// ---- Admins: prevention messages -------------------------------------------------------------------

export async function sendMalariaMessage(formData: FormData): Promise<ActionResult & { recipients?: number }> {
  const admin = await authorize(Role.ADMIN);
  if (!admin) return DENIED;
  const body = text(formData, "body")?.slice(0, 300);
  const inApp = checkbox(formData, "inApp");
  const sms = checkbox(formData, "sms");
  if (!body) return fail("Write the message.");
  if (!inApp && !sms) return fail("Choose in the app, by SMS, or both.");
  const r = await sendCampaign({ body, district: text(formData, "district"), inApp, sms, sentBy: admin });
  revalidatePath("/admin/malaria");
  return { ok: true, id: r.id, recipients: r.recipients };
}

export async function saveMalariaTipSettings(formData: FormData): Promise<ActionResult> {
  const admin = await authorize(Role.ADMIN);
  if (!admin) return DENIED;
  await saveWeeklyTipSettings({ inApp: checkbox(formData, "inApp"), sms: checkbox(formData, "sms") });
  revalidatePath("/admin/malaria");
  return { ok: true };
}
