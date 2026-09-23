import "server-only";

import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { queueSms } from "./index";
import { APP_TIME_ZONE, sms } from "./templates";

/** Local hour (in APP_TIME_ZONE) from which doctors' daily schedule texts go out. */
const DAILY_SCHEDULE_HOUR = Number(process.env.SMS_DAILY_SCHEDULE_HOUR ?? 7);
const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Calendar parts of `date` in `timeZone`. */
function zonedParts(date: Date, timeZone = APP_TIME_ZONE) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  return { y: +parts.year, m: +parts.month, d: +parts.day, h: +parts.hour, min: +parts.minute, s: +parts.second };
}

/** Start and end (as instants) of the local day containing `date`, plus its YYYY-MM-DD key. */
function localDay(date: Date, offsetDays = 0) {
  const p = zonedParts(date);
  const offsetMs = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(date.getTime() / 1000) * 1000;
  const start = new Date(Date.UTC(p.y, p.m - 1, p.d + offsetDays) - offsetMs);
  const end = new Date(Date.UTC(p.y, p.m - 1, p.d + offsetDays + 1) - offsetMs);
  const key = new Date(Date.UTC(p.y, p.m - 1, p.d + offsetDays)).toISOString().slice(0, 10);
  return { start, end, key, hour: p.h };
}

/**
 * Queues time-based SMS. Safe to run as often as you like (e.g. every 15 minutes):
 * each message has a dedupe key, so nobody is texted twice.
 */
export async function runScheduledSms(now = new Date()) {
  const results = { appointmentReminders: 0, followUpReminders: 0, dailySchedules: 0, skipped: 0 };
  const add = (key: keyof typeof results, r: { queued: number; skipped: number }) => {
    results[key] += r.queued;
    results.skipped += r.skipped;
  };

  // 1. Patients: confirmed appointments in the next 24 hours.
  const upcoming = await prisma.appointment.findMany({
    where: { status: "CONFIRMED", startsAt: { gt: now, lte: new Date(now.getTime() + REMINDER_WINDOW_MS) } },
    include: {
      patient: { select: { firstName: true } },
      doctor: { select: { firstName: true, lastName: true } },
      hospital: { select: { name: true } },
    },
  });
  add(
    "appointmentReminders",
    await queueSms(
      upcoming.map((a) => ({
        userId: a.patientId,
        category: "APPOINTMENT_REMINDER",
        body: sms.patientReminder(a.patient, a, a.doctor, a.hospital?.name),
        dedupeKey: `appointment-reminder:${a.id}`,
      }))
    )
  );

  // 2. Patients: follow-ups due tomorrow (follow-up dates are stored as UTC midnight of the chosen day).
  const tomorrow = localDay(now, 1);
  const followUpDate = new Date(`${tomorrow.key}T00:00:00Z`);
  const followUps = await prisma.medicalRecord.findMany({
    where: { followUpDate },
    include: { patient: { select: { firstName: true } }, doctor: { select: { firstName: true, lastName: true } } },
  });
  add(
    "followUpReminders",
    await queueSms(
      followUps.map((r) => ({
        userId: r.patientId,
        category: "FOLLOW_UP_REMINDER",
        body: sms.followUpReminder(r.patient, followUpDate, r.doctor),
        dedupeKey: `follow-up:${r.id}`,
      }))
    )
  );

  // 3. Doctors: today's schedule, once per day after DAILY_SCHEDULE_HOUR.
  const today = localDay(now);
  if (today.hour >= DAILY_SCHEDULE_HOUR) {
    const todays = await prisma.appointment.findMany({
      where: {
        status: "CONFIRMED",
        startsAt: { gte: now, lt: today.end },
        doctor: { role: Role.DOCTOR, isActive: true },
      },
      orderBy: { startsAt: "asc" },
      include: { doctor: { select: { id: true, firstName: true, lastName: true } } },
    });
    const byDoctor = new Map<string, typeof todays>();
    for (const a of todays) byDoctor.set(a.doctorId!, [...(byDoctor.get(a.doctorId!) ?? []), a]);

    add(
      "dailySchedules",
      await queueSms(
        [...byDoctor.values()].map((appts) => ({
          userId: appts[0].doctor!.id,
          category: "DAILY_SCHEDULE",
          body: sms.doctorDailySchedule(appts[0].doctor!, appts.length, appts[0].startsAt),
          dedupeKey: `daily-schedule:${appts[0].doctor!.id}:${today.key}`,
        }))
      )
    );
  }

  return results;
}
