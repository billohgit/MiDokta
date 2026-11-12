import "server-only";

import { Prisma, Role, type MalariaCase, type MalariaTestType, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PORTAL_TOKEN, notifyRoles, notifyUsers, notifyUsersOnce } from "@/lib/notifications";
import { queueSms } from "@/lib/sms";
import { SMS_BRAND } from "@/lib/sms/templates";
import { type LatLng, directionsUrl, distanceKm, formatDistance } from "@/lib/geo";
import { nearestHospitals } from "@/lib/omega/hospitals";
import { FOR_WHOM_LABEL } from "@/components/malaria/shared";
import { type ForWhom, type Outcome, PREVENTION_TIPS, SL_DISTRICTS, scoreScreening, tipOfTheWeek } from "./screening";

/**
 * The malaria care pathway:
 *
 *   Omega's check (or a health worker) -> suspected case referred to the nearest hospital or clinic
 *   -> a doctor or nurse records the test -> negative: closed | positive: treatment plan, which a
 *   nurse may draft but only a doctor approves -> daily reminders through the treatment -> the
 *   patient says whether they finished and feel better -> completed, or followed up by a health worker.
 *
 * Every step is written to the case timeline (CareEvent). syncMalaria, run by the scheduled job,
 * sends the reminders, alerts health workers when something stalls, and sends the weekly prevention tip.
 */

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** Doctors and nurses record results and plans; only doctors approve plans. */
export const HEALTH_WORKER_ROLES: Role[] = [Role.DOCTOR, Role.NURSE];
export const OPEN_STATUSES = ["REFERRED", "POSITIVE", "TREATMENT", "INCOMPLETE"] as const;


const logEvent = (caseId: string, kind: "STATUS" | "NOTE" | "CONTACT" | "SMS" | "ALERT", text: string, actorId?: string | null) =>
  prisma.careEvent.create({ data: { malariaCaseId: caseId, kind, text: text.slice(0, 1000), actorId: actorId ?? null } });

const caseLink = (id: string) => `${PORTAL_TOKEN}/malaria/${id}`;
const fullName = (u: Pick<User, "firstName" | "lastName">) => `${u.firstName} ${u.lastName}`;

/** Text and in-app notice to the patient. */
async function tellPatient(patientId: string, title: string, body: string, opts: { dedupeKey?: string; sentById?: string } = {}) {
  const n = { type: "GENERAL" as const, title, body, link: "/patient/malaria" };
  if (opts.dedupeKey) await notifyUsersOnce([patientId], n, opts.dedupeKey);
  else await notifyUsers([patientId], n);
  return queueSms({ userId: patientId, category: "MALARIA", body: `${SMS_BRAND}: ${body}`.slice(0, 459), dedupeKey: opts.dedupeKey, sentById: opts.sentById });
}

async function workerIds(roles: Role[] = HEALTH_WORKER_ROLES) {
  return (await prisma.user.findMany({ where: { role: { in: roles }, isActive: true }, select: { id: true } })).map((u) => u.id);
}

// ---- Day arithmetic (calendar days in UTC, which is Sierra Leone's time) ---------------------------

const dayStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
/** Which treatment day `now` is: 1 on the first day. */
export const treatmentDay = (c: Pick<MalariaCase, "treatmentStartsAt">, now = new Date()) =>
  c.treatmentStartsAt ? Math.floor((dayStart(now).getTime() - dayStart(c.treatmentStartsAt).getTime()) / DAY) + 1 : 0;

// ---- Where to go -----------------------------------------------------------------------------------

export type Facility = {
  name: string;
  kind: string;
  distanceKm: number | null;
  address: string | null;
  phone: string | null;
  directionsUrl: string | null;
  onMiDokta: boolean;
  emergency?: boolean;
  lat: number | null;
  lng: number | null;
};

export type PharmacyOption = Facility & { id: string };

/** The nearest hospitals and clinics (hospitals only for danger signs), and the nearest MiDokta pharmacies. */
export async function findCare(location: LatLng | null, hospitalsOnly: boolean): Promise<{ facilities: Facility[]; pharmacies: PharmacyOption[] }> {
  let facilities: Facility[] = [];
  if (location) {
    const { hospitals } = await nearestHospitals(location, !hospitalsOnly).catch(() => ({ hospitals: [] }));
    facilities = hospitals.map((h) => ({
      name: h.name,
      kind: h.kind,
      distanceKm: h.distanceKm,
      address: h.address,
      phone: h.phone,
      directionsUrl: h.directionsUrl,
      onMiDokta: h.onMiDokta,
      emergency: h.emergency,
      lat: h.lat,
      lng: h.lng,
    }));
  }
  if (facilities.length === 0) {
    const ours = await prisma.hospital.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, take: 5 });
    facilities = ours.map((h) => ({
      name: h.name,
      kind: "hospital",
      distanceKm: location && h.latitude != null && h.longitude != null ? Math.round(distanceKm(location, { lat: h.latitude, lng: h.longitude }) * 10) / 10 : null,
      address: [h.address, h.city].filter(Boolean).join(", ") || null,
      phone: h.phone,
      directionsUrl: h.latitude != null && h.longitude != null ? directionsUrl(location, { lat: h.latitude, lng: h.longitude }) : null,
      onMiDokta: true,
      lat: h.latitude,
      lng: h.longitude,
    }));
  }

  const shops = await prisma.pharmacy.findMany({ where: { isActive: true }, take: 50 });
  const pharmacies: PharmacyOption[] = shops
    .map((p) => {
      const at = p.latitude != null && p.longitude != null ? { lat: p.latitude, lng: p.longitude } : null;
      return {
        id: p.id,
        name: p.name,
        kind: "pharmacy",
        distanceKm: location && at ? Math.round(distanceKm(location, at) * 10) / 10 : null,
        address: [p.address, p.city].filter(Boolean).join(", ") || null,
        phone: p.phone,
        directionsUrl: at ? directionsUrl(location, at) : null,
        onMiDokta: true,
        lat: at?.lat ?? null,
        lng: at?.lng ?? null,
      };
    })
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
    .slice(0, 3);
  return { facilities: facilities.slice(0, 4), pharmacies };
}

const where = (f: Facility | null) => (f ? `${f.name}${f.distanceKm != null ? ` (${formatDistance(f.distanceKm)} away)` : ""}` : "the nearest health centre");

// ---- Screening -------------------------------------------------------------------------------------

export type ScreeningInput = {
  answers: Record<string, boolean>;
  dangerSigns: string[];
  forWhom: ForWhom;
  district: string | null;
  location: LatLng | null;
};

export type ScreeningResult = {
  outcome: Outcome;
  score: number;
  caseId: string | null;
  /** True when the patient already had an open case, which this check was added to. */
  existingCase: boolean;
  advice: string;
  facilities: Facility[];
  pharmacies: PharmacyOption[];
};

/** Scores a check, and for a suspected case refers the patient and tells the health workers. */
export async function screenPatient(patient: User, input: ScreeningInput, actor: User = patient): Promise<ScreeningResult> {
  const { score, outcome } = scoreScreening(input.answers, input.dangerSigns);
  const district = input.district && (SL_DISTRICTS as readonly string[]).includes(input.district) ? input.district : (input.district?.slice(0, 60) ?? null);
  const screening = await prisma.malariaScreening.create({
    data: {
      patientId: patient.id,
      answers: input.answers,
      score,
      dangerSigns: input.dangerSigns,
      outcome,
      forWhom: input.forWhom,
      district,
      latitude: input.location?.lat,
      longitude: input.location?.lng,
    },
  });

  const who = input.forWhom === "CHILD" ? "your child" : "you";
  if (outcome === "LOW") {
    const fever = input.answers.fever === true;
    return {
      outcome,
      score,
      caseId: null,
      existingCase: false,
      advice: fever
        ? `Your answers don't strongly suggest malaria (${score}%). But fever can still be malaria: if it lasts more than a day, get a malaria test at a health centre.`
        : `Your answers don't suggest malaria (${score}%). Keep protecting ${who}: ${PREVENTION_TIPS[0]}`,
      facilities: [],
      pharmacies: [],
    };
  }

  const danger = outcome === "DANGER";
  const { facilities, pharmacies } = await findCare(input.location, danger);
  // A health worker checking a patient refers them to the worker's own hospital first.
  const own = actor.id !== patient.id && actor.hospitalId ? await prisma.hospital.findUnique({ where: { id: actor.hospitalId } }) : null;
  if (own) {
    const i = facilities.findIndex((f) => f.name === own.name);
    if (i >= 0) facilities.splice(i, 1);
    facilities.unshift({
      name: own.name,
      kind: "hospital",
      distanceKm: null,
      address: [own.address, own.city].filter(Boolean).join(", ") || null,
      phone: own.phone,
      directionsUrl: own.latitude != null && own.longitude != null ? directionsUrl(null, { lat: own.latitude, lng: own.longitude }) : null,
      onMiDokta: true,
      lat: own.latitude,
      lng: own.longitude,
    });
  }
  const facility = facilities[0] ?? null;
  const urgency = danger ? "EMERGENCY" : "URGENT";

  // One open case per patient: a new check is added to it (and can make it more urgent).
  const open = await prisma.malariaCase.findFirst({ where: { patientId: patient.id, status: { in: [...OPEN_STATUSES] } }, orderBy: { createdAt: "desc" } });
  let c: MalariaCase;
  if (open) {
    c = danger && open.urgency !== "EMERGENCY" ? await prisma.malariaCase.update({ where: { id: open.id }, data: { urgency } }) : open;
    await logEvent(c.id, danger ? "ALERT" : "NOTE", `New malaria check: ${score}%${danger ? `, danger signs: ${input.dangerSigns.join(", ")}` : ""}`, actor.id);
  } else {
    c = await prisma.malariaCase.create({
      data: {
        patientId: patient.id,
        screeningId: screening.id,
        openedById: actor.id === patient.id ? null : actor.id,
        urgency,
        district,
        latitude: input.location?.lat,
        longitude: input.location?.lng,
        facilityName: facility?.name,
        facilityKind: facility?.kind,
        facilityDistanceKm: facility?.distanceKm,
        facilityLat: facility?.lat,
        facilityLng: facility?.lng,
        facilityPhone: facility?.phone,
        pharmacyId: pharmacies[0]?.id,
      },
    });
    await logEvent(
      c.id,
      "STATUS",
      `${danger ? "Danger signs" : "Suspected malaria"} (${score}% of symptoms${danger ? `; ${input.dangerSigns.join(", ")}` : ""}). Referred to ${where(facility)} for a test.`,
      actor.id === patient.id ? null : actor.id,
    );
  }

  const advice = danger
    ? `These are danger signs of severe malaria. Go to ${where(facility)} now, or call your emergency number. Don't wait.`
    : `Your answers suggest malaria (${score}%). Please get ${who === "you" ? "" : "your child "}a malaria test today or tomorrow at ${where(facility)}. If it's positive, a clinician will plan the treatment and the nearest pharmacy can supply the medicine.`;

  if (!open || danger) {
    await tellPatient(patient.id, danger ? "Malaria danger signs: go to hospital now" : "Malaria check: please get tested", advice, {
      dedupeKey: `malaria:screen:${screening.id}`,
    });
    await logEvent(c.id, "SMS", `Patient told: "${advice}"`);
    const title = `${danger ? "DANGER signs of severe malaria" : "Suspected malaria"}: ${fullName(patient)} (${score}%)`;
    await notifyUsers(
      await workerIds(),
      { type: "GENERAL", title, body: `${FOR_WHOM_LABEL[input.forWhom]} · ${district ?? "district not given"} · referred to ${facility?.name ?? "nearest health centre"}`, link: caseLink(c.id) },
      actor.id,
    );
  }

  return { outcome, score, caseId: c.id, existingCase: !!open, advice, facilities, pharmacies };
}

// ---- Health workers --------------------------------------------------------------------------------

async function move(id: string, from: MalariaCase["status"][], data: Prisma.MalariaCaseUncheckedUpdateManyInput) {
  const { count } = await prisma.malariaCase.updateMany({ where: { id, status: { in: from } }, data });
  return count === 1;
}

export async function recordTest(
  c: MalariaCase,
  actor: User,
  t: { type: MalariaTestType; positive: boolean; species: string | null; note: string | null; testedAt: string | null },
) {
  const ok = await move(c.id, ["REFERRED", "POSITIVE"], {
    testType: t.type,
    testPositive: t.positive,
    species: t.species,
    testNote: t.note,
    // Left blank, a correction keeps where it was tested before; a first result, where it was referred.
    testedAt: t.testedAt ?? c.testedAt ?? c.facilityName,
    testedOn: new Date(),
    testedById: actor.id,
    status: t.positive ? "POSITIVE" : "NEGATIVE",
    closedAt: t.positive ? null : new Date(),
  });
  if (!ok) return false;
  const test = t.type === "RDT" ? "rapid test (RDT)" : "microscopy";
  await logEvent(c.id, "STATUS", `${t.positive ? "POSITIVE" : "Negative"} by ${test}${t.species ? `, ${t.species}` : ""}${t.testedAt ? ` at ${t.testedAt}` : ""}${t.note ? `. ${t.note}` : ""}`, actor.id);

  if (t.positive) {
    await tellPatient(
      c.patientId,
      "Malaria test positive",
      "Your malaria test was positive. A clinician is preparing your treatment plan; you'll get it here and by text. If you get worse, go to hospital now.",
    );
    if (actor.role !== Role.DOCTOR) {
      const patient = await prisma.user.findUniqueOrThrow({ where: { id: c.patientId } });
      await notifyUsers(await workerIds([Role.DOCTOR]), { type: "GENERAL", title: `Malaria positive: treatment plan needed for ${fullName(patient)}`, link: caseLink(c.id) });
    }
  } else {
    await tellPatient(
      c.patientId,
      "Malaria test negative",
      "Your malaria test was negative. If you still have a fever in two days, see a health worker: something else may be causing it.",
    );
  }
  return true;
}

/** A doctor's plan is approved as it's saved; a nurse's waits for a doctor. */
export async function savePlan(c: MalariaCase, actor: User, p: { text: string; days: number; dosesPerDay: number }) {
  if (c.status !== "POSITIVE") return false;
  const approve = actor.role === Role.DOCTOR;
  await prisma.malariaCase.update({
    where: { id: c.id },
    data: { planText: p.text, planDays: p.days, dosesPerDay: p.dosesPerDay, planDraftedById: actor.id, planApprovedById: null, planApprovedAt: null },
  });
  await logEvent(c.id, "NOTE", `Treatment plan ${approve ? "written" : "drafted"}: ${p.text} (${p.days} days, ${p.dosesPerDay}× a day)`, actor.id);
  if (approve) return approvePlan({ ...c, planText: p.text, planDays: p.days, dosesPerDay: p.dosesPerDay }, actor);
  const patient = await prisma.user.findUniqueOrThrow({ where: { id: c.patientId } });
  await notifyUsers(await workerIds([Role.DOCTOR]), { type: "GENERAL", title: `Approve malaria treatment plan for ${fullName(patient)}`, body: p.text, link: caseLink(c.id) }, actor.id);
  return true;
}

export async function approvePlan(c: Pick<MalariaCase, "id" | "patientId" | "planText" | "planDays" | "dosesPerDay" | "pharmacyId">, doctor: User) {
  if (doctor.role !== Role.DOCTOR || !c.planText || !c.planDays) return false;
  const start = dayStart(new Date());
  const ok = await move(c.id, ["POSITIVE"], {
    planApprovedById: doctor.id,
    planApprovedAt: new Date(),
    treatmentStartsAt: start,
    treatmentEndsAt: new Date(start.getTime() + c.planDays * DAY),
    status: "TREATMENT",
  });
  if (!ok) return false;
  await logEvent(c.id, "STATUS", `Treatment plan approved by Dr. ${doctor.lastName}. Treatment starts today, for ${c.planDays} days.`, doctor.id);
  const pharmacy = c.pharmacyId ? await prisma.pharmacy.findUnique({ where: { id: c.pharmacyId } }) : null;
  await tellPatient(
    c.patientId,
    "Your malaria treatment plan",
    `Your malaria treatment, approved by Dr. ${doctor.lastName}: ${c.planText}${pharmacy ? ` You can get it at ${pharmacy.name}${pharmacy.address ? `, ${pharmacy.address}` : ""}.` : ""} Take every dose for all ${c.planDays} days, even if you feel better.`,
  );
  return true;
}

export async function addNote(c: MalariaCase, actor: User, text: string, contact: boolean) {
  await logEvent(c.id, contact ? "CONTACT" : "NOTE", text, actor.id);
}

/** A health worker records how the treatment ended, e.g. after a follow-up call. */
export async function closeCase(c: MalariaCase, actor: User, completed: boolean, note: string) {
  const ok = await move(c.id, ["TREATMENT", "INCOMPLETE"], {
    status: completed ? "COMPLETED" : "INCOMPLETE",
    completedAt: completed ? new Date() : null,
    closedAt: new Date(),
    closingNote: note,
  });
  if (ok) await logEvent(c.id, "STATUS", `${completed ? "Treatment completed" : "Closed without completing treatment"}: ${note}`, actor.id);
  return ok;
}

export async function cancelCase(c: MalariaCase, actor: User, reason: string) {
  const ok = await move(c.id, [...OPEN_STATUSES], { status: "CANCELLED", closedAt: new Date(), closingNote: reason });
  if (ok) await logEvent(c.id, "STATUS", `Cancelled: ${reason}`, actor.id);
  return ok;
}

// ---- The patient during treatment -------------------------------------------------------------------

export async function logDose(c: MalariaCase, now = new Date()) {
  const day = treatmentDay(c, now);
  if (c.status !== "TREATMENT" || !c.planDays || day < 1 || day > c.planDays) return false;
  await prisma.malariaDose.upsert({ where: { caseId_day: { caseId: c.id, day } }, create: { caseId: c.id, day }, update: {} });
  await logEvent(c.id, "NOTE", `Patient took day ${day} of ${c.planDays} of the medicine`);
  return true;
}

export type PatientOutcome = "BETTER" | "STILL_SICK" | "NOT_FINISHED";

export async function reportOutcome(c: MalariaCase, outcome: PatientOutcome) {
  const better = outcome === "BETTER";
  const ok = await move(c.id, ["TREATMENT"], {
    patientOutcome: outcome,
    outcomeAt: new Date(),
    status: better ? "COMPLETED" : "INCOMPLETE",
    completedAt: better ? new Date() : null,
    closedAt: better ? new Date() : null,
  });
  if (!ok) return false;
  const said = { BETTER: "finished the treatment and feels better", STILL_SICK: "finished the treatment but is still unwell", NOT_FINISHED: "didn't finish the treatment" }[outcome];
  await logEvent(c.id, better ? "STATUS" : "ALERT", `The patient reported: ${said}`);
  if (!better) {
    const patient = await prisma.user.findUniqueOrThrow({ where: { id: c.patientId } });
    await notifyUsers(await workerIds(), { type: "GENERAL", title: `Malaria follow-up needed: ${fullName(patient)} ${said}`, link: caseLink(c.id) });
    await tellPatient(
      c.patientId,
      "We'll follow up",
      outcome === "STILL_SICK"
        ? "Thank you. As you're still unwell, please see a health worker today. If you have danger signs, go to hospital now. A nurse will contact you."
        : "Thank you for telling us. Please don't stop malaria medicine early: a nurse will contact you about finishing it.",
    );
  }
  return true;
}

// ---- What is late ----------------------------------------------------------------------------------

/** What is overdue on a case right now, for lists and alerts. */
export function malariaDelay(c: MalariaCase, now = new Date()): { rule: string; text: string } | null {
  const t = now.getTime();
  if (c.status === "REFERRED" && t > c.createdAt.getTime() + (c.urgency === "EMERGENCY" ? 6 * HOUR : 3 * DAY)) {
    return { rule: "not-tested", text: "Not tested yet" };
  }
  if (c.status === "POSITIVE" && c.testedOn && t > c.testedOn.getTime() + 6 * HOUR) {
    return { rule: "no-plan", text: c.planText ? "Plan waiting for a doctor's approval" : "No treatment plan yet" };
  }
  if (c.status === "TREATMENT" && c.treatmentEndsAt && t > c.treatmentEndsAt.getTime() + 2 * DAY) {
    return { rule: "no-outcome", text: "Completion not confirmed" };
  }
  return null;
}

// ---- Prevention messages ---------------------------------------------------------------------------

export type WeeklyTipSettings = { inApp: boolean; sms: boolean };
const SETTINGS_KEY = "malaria.weeklyTips";
const LAST_WEEK_KEY = "malaria.lastWeeklyTip";

export async function weeklyTipSettings(): Promise<WeeklyTipSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: SETTINGS_KEY } });
  const v = (row?.value ?? {}) as Partial<WeeklyTipSettings>;
  return { inApp: v.inApp ?? true, sms: v.sms ?? false };
}

export async function saveWeeklyTipSettings(s: WeeklyTipSettings) {
  await prisma.appSetting.upsert({ where: { key: SETTINGS_KEY }, create: { key: SETTINGS_KEY, value: s }, update: { value: s } });
}

/** Active patients, optionally only those in a district (from their address or a malaria check). */
async function patientsIn(district: string | null) {
  const where: Prisma.UserWhereInput = { role: Role.PATIENT, isActive: true };
  if (district) {
    where.OR = [
      { state: { equals: district, mode: "insensitive" } },
      { city: { equals: district, mode: "insensitive" } },
      { malariaScreenings: { some: { district } } },
    ];
  }
  return prisma.user.findMany({ where, select: { id: true } });
}

/** Sends a prevention message to patients, in the app and/or by SMS, and logs it. */
export async function sendCampaign(m: { body: string; district: string | null; inApp: boolean; sms: boolean; sentBy: User | null; automatic?: boolean }) {
  const patients = await patientsIn(m.district);
  const campaign = await prisma.malariaCampaign.create({
    data: { body: m.body, district: m.district, inApp: m.inApp, sms: m.sms, recipients: patients.length, automatic: m.automatic ?? false, sentById: m.sentBy?.id },
  });
  if (m.inApp && patients.length) {
    await prisma.notification.createMany({
      data: patients.map((p) => ({ userId: p.id, type: "GENERAL" as const, title: "Malaria prevention", body: m.body, link: "/patient/malaria", dedupeKey: `malaria-campaign:${campaign.id}:${p.id}` })),
      skipDuplicates: true,
    });
  }
  let smsQueued = 0;
  if (m.sms && patients.length) {
    const r = await queueSms(
      patients.map((p) => ({ userId: p.id, category: "MALARIA" as const, body: `${SMS_BRAND} malaria tip: ${m.body}`.slice(0, 459), dedupeKey: `malaria-campaign:${campaign.id}:${p.id}`, sentById: m.sentBy?.id })),
    );
    smsQueued = r.queued;
    await prisma.malariaCampaign.update({ where: { id: campaign.id }, data: { smsQueued } });
  }
  return { id: campaign.id, recipients: patients.length, smsQueued };
}

// ---- Scheduled job ---------------------------------------------------------------------------------

/**
 * Reminders to patients, alerts to health workers when a case stalls (once per case and problem),
 * and on Mondays the week's prevention tip. Safe to run repeatedly.
 */
export async function syncMalaria(now = new Date()) {
  const result = { reminders: 0, alerts: 0, weeklyTip: 0 };
  const cases = await prisma.malariaCase.findMany({
    where: { status: { in: ["REFERRED", "POSITIVE", "TREATMENT", "NEGATIVE"] } },
    include: { patient: { select: { firstName: true, lastName: true } }, doses: { select: { day: true } } },
  });
  const t = now.getTime();
  const workers = await workerIds();
  const doctors = await workerIds([Role.DOCTOR]);

  for (const c of cases) {
    const name = fullName(c.patient);
    // Patient reminders, each sent once.
    if (c.status === "REFERRED" && t > c.createdAt.getTime() + (c.urgency === "EMERGENCY" ? 2 * HOUR : DAY)) {
      const r = await tellPatient(
        c.patientId,
        "Have you had your malaria test?",
        `Hi ${c.patient.firstName}, have you had your malaria test? Please go to ${c.facilityName ?? "the nearest health centre"} as soon as you can. Malaria gets worse quickly if it isn't treated.`,
        { dedupeKey: `malaria:${c.id}:test-reminder` },
      );
      if (r.queued) {
        result.reminders++;
        await logEvent(c.id, "SMS", "Reminded the patient to get tested");
      }
    }
    if (c.status === "TREATMENT" && c.planDays) {
      const day = treatmentDay(c, now);
      if (day >= 1 && day <= c.planDays) {
        const r = await tellPatient(
          c.patientId,
          `Malaria medicine: day ${day} of ${c.planDays}`,
          `Day ${day} of ${c.planDays}: take your malaria medicine${c.dosesPerDay === 2 ? " twice today, morning and evening" : " today"}. Tap "I took today's medicine" in the app.`,
          { dedupeKey: `malaria:${c.id}:dose:${day}` },
        );
        if (r.queued) result.reminders++;
      } else if (day > c.planDays) {
        const r = await tellPatient(
          c.patientId,
          "Did you finish your malaria treatment?",
          `Hi ${c.patient.firstName}, did you finish all your malaria medicine, and do you feel better? Please answer in the app on your Malaria page.`,
          { dedupeKey: `malaria:${c.id}:outcome-ask` },
        );
        if (r.queued) {
          result.reminders++;
          await logEvent(c.id, "SMS", "Asked the patient whether they finished the treatment");
        }
      }
    }
    if (c.status === "NEGATIVE" && c.testedOn && t > c.testedOn.getTime() + 2 * DAY && t < c.testedOn.getTime() + 5 * DAY) {
      await tellPatient(c.patientId, "How are you feeling?", "If you still have a fever after your negative malaria test, please see a health worker.", {
        dedupeKey: `malaria:${c.id}:negative-check`,
      });
    }

    // Alerts to health workers.
    const delay = malariaDelay(c, now);
    if (delay) {
      const sent = await notifyUsersOnce(
        delay.rule === "no-plan" ? doctors : workers,
        { type: "GENERAL", title: `Malaria: ${delay.text}`, body: `${name} · case #${c.number}`, link: caseLink(c.id) },
        `malaria:${c.id}:${delay.rule}`,
      );
      if (sent) {
        result.alerts++;
        await logEvent(c.id, "ALERT", delay.text);
      }
    }
  }

  // Monday: the week's prevention tip, once.
  if (now.getUTCDay() === 1) {
    const week = dayStart(now).toISOString().slice(0, 10);
    const last = await prisma.appSetting.findUnique({ where: { key: LAST_WEEK_KEY } });
    const settings = await weeklyTipSettings();
    if (last?.value !== week && (settings.inApp || settings.sms)) {
      await prisma.appSetting.upsert({ where: { key: LAST_WEEK_KEY }, create: { key: LAST_WEEK_KEY, value: week }, update: { value: week } });
      const r = await sendCampaign({ body: tipOfTheWeek(now).text, district: null, inApp: settings.inApp, sms: settings.sms, sentBy: null, automatic: true });
      result.weeklyTip = r.recipients;
    }
  }
  return result;
}
