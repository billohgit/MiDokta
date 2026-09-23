import { formatInvoiceNumber, formatMoney } from "@/lib/money";

/** Brand shown at the start of every SMS. */
export const SMS_BRAND = process.env.SMS_BRAND_NAME ?? "Mi Dokta";

/** Time zone used to write dates and times in SMS (server time zone may differ). */
export const APP_TIME_ZONE = process.env.APP_TIME_ZONE ?? "Africa/Freetown";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: APP_TIME_ZONE,
});
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: APP_TIME_ZONE });

export const smsDate = (d: Date) => dateFmt.format(d); // "Tue 23 Sep"
export const smsTime = (d: Date) => timeFmt.format(d); // "10:00"
const when = (d: Date) => `${smsDate(d)} at ${smsTime(d)}`;

type Person = { firstName: string; lastName?: string };
type Appt = { startsAt: Date; title: string; visitType: "IN_PERSON" | "VIDEO_CALL" };

const where = (a: Appt, hospital?: string | null) =>
  a.visitType === "VIDEO_CALL" ? " (video call)" : hospital ? ` at ${hospital}` : "";

const drName = (d?: Person | null) => (d ? `Dr. ${d.lastName ?? d.firstName}` : "a doctor");

/**
 * Replaces characters outside the GSM-7 SMS alphabet that sneak in via Intl formatting or copy-paste
 * (non-breaking spaces, curly quotes, dashes). Otherwise the whole SMS is sent as UCS-2,
 * which fits 70 instead of 160 characters per segment and roughly doubles the cost.
 */
export const gsmSafe = (text: string) =>
  text
    .replace(/[\u00A0\u2007\u202F]/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...");

const templates = {
  // ---- Patients ----
  appointmentRequested: (p: Person, a: Appt) =>
    `${SMS_BRAND}: Hi ${p.firstName}, we received your appointment request for ${when(a.startsAt)}. We'll text you once it's confirmed.`,

  appointmentConfirmed: (p: Person, a: Appt, doctor?: Person | null, hospital?: string | null) =>
    `${SMS_BRAND}: Hi ${p.firstName}, your appointment with ${drName(doctor)} is confirmed for ${when(a.startsAt)}${where(a, hospital)}.`,

  appointmentRejected: (p: Person, a: Appt) =>
    `${SMS_BRAND}: Hi ${p.firstName}, we couldn't confirm your appointment request for ${when(a.startsAt)}. Please contact us to choose another time.`,

  appointmentCancelled: (p: Person, a: Appt) =>
    `${SMS_BRAND}: Hi ${p.firstName}, your appointment on ${when(a.startsAt)} has been cancelled. Please contact us to rebook.`,

  patientReminder: (p: Person, a: Appt, doctor?: Person | null, hospital?: string | null) =>
    `${SMS_BRAND}: Reminder, ${p.firstName}: you have an appointment with ${drName(doctor)} on ${when(a.startsAt)}${where(a, hospital)}.`,

  followUpReminder: (p: Person, date: Date, doctor?: Person | null) =>
    `${SMS_BRAND}: Hi ${p.firstName}, your follow-up with ${drName(doctor)} is due on ${smsDate(date)}. Please contact us to book a visit.`,

  invoiceCreated: (p: Person, number: number, total: string, dueDate?: Date | null) =>
    `${SMS_BRAND}: Hi ${p.firstName}, invoice ${formatInvoiceNumber(number)} for ${formatMoney(total)} has been issued${dueDate ? `, due ${smsDate(dueDate)}` : ""}.`,

  paymentReceived: (p: Person, number: number, amount: string, balance: number) =>
    `${SMS_BRAND}: Thank you ${p.firstName}. We received ${formatMoney(amount)} for invoice ${formatInvoiceNumber(number)}. ${balance > 0 ? `Balance: ${formatMoney(balance)}.` : "Paid in full."}`,

  // ---- Doctors ----
  doctorAssigned: (patient: Person, a: Appt) =>
    `${SMS_BRAND}: New appointment: ${patient.firstName} ${patient.lastName ?? ""}, ${a.title}, ${when(a.startsAt)}${a.visitType === "VIDEO_CALL" ? " (video call)" : ""}.`,

  doctorCancelled: (patient: Person, a: Appt) =>
    `${SMS_BRAND}: Cancelled: ${patient.firstName} ${patient.lastName ?? ""}'s appointment on ${when(a.startsAt)}.`,

  doctorDailySchedule: (doctor: Person, count: number, first: Date) =>
    `${SMS_BRAND}: Good morning Dr. ${doctor.lastName ?? doctor.firstName}. You have ${count} appointment${count === 1 ? "" : "s"} today, starting at ${smsTime(first)}.`,
};

type Templates = typeof templates;

/** Message builders; every result is GSM-safe. */
export const sms = Object.fromEntries(
  Object.entries(templates).map(([name, build]) => [
    name,
    (...args: unknown[]) => gsmSafe((build as (...a: unknown[]) => string)(...args)),
  ]),
) as Templates;
