import "server-only";

import { type NotificationType, Role, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PORTAL_BASE } from "@/lib/roles";

type NotificationInput = { type: NotificationType; title: string; body?: string; link?: string };

/**
 * Placeholder for the recipient's own portal root in a notification link, so one
 * notification can be sent to roles that read it in different portals. For example
 * `{portal}/appointments` becomes `/admin/appointments` for an admin and
 * `/staff/appointments` for a receptionist.
 */
export const PORTAL_TOKEN = "{portal}";

/** Sends a notification to specific users, skipping `exceptUserId` (usually whoever triggered it). */
export async function notifyUsers(userIds: (string | null | undefined)[], n: NotificationInput, exceptUserId?: string) {
  const ids = [...new Set(userIds.filter((id): id is string => !!id && id !== exceptUserId))];
  if (ids.length === 0) return;

  if (!n.link?.includes(PORTAL_TOKEN)) {
    await prisma.notification.createMany({ data: ids.map((userId) => ({ userId, ...n })) });
    return;
  }

  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, role: true } });
  await prisma.notification.createMany({
    data: users.map((u) => ({ ...n, userId: u.id, link: n.link!.split(PORTAL_TOKEN).join(PORTAL_BASE[u.role] ?? "") })),
  });
}

/** Sends a notification to every active user with one of the given roles. */
export async function notifyRoles(roles: Role[], n: NotificationInput, exceptUserId?: string) {
  const users = await prisma.user.findMany({ where: { role: { in: roles }, isActive: true }, select: { id: true } });
  await notifyUsers(
    users.map((u) => u.id),
    n,
    exceptUserId
  );
}

/**
 * Like `notifyRoles`, but sends each person the notification at most once per `key`.
 * Used for alerts that would otherwise repeat on every trigger, such as low stock.
 */
export async function notifyRolesOnce(roles: Role[], n: NotificationInput, key: string) {
  const users = await prisma.user.findMany({
    where: { role: { in: roles }, isActive: true },
    select: { id: true, role: true },
  });
  if (users.length === 0) return;

  await prisma.notification.createMany({
    data: users.map((u) => ({
      ...n,
      userId: u.id,
      link: n.link?.split(PORTAL_TOKEN).join(PORTAL_BASE[u.role] ?? ""),
      // The key is unique across all notifications, so it has to include the recipient.
      dedupeKey: `${key}:${u.id}`,
    })),
    skipDuplicates: true,
  });
}

const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Creates "appointment starting soon" reminders for a doctor's confirmed appointments
 * in the next 24 hours. Idempotent thanks to the unique dedupe key.
 */
export async function ensureReminders(user: User) {
  if (user.role !== Role.DOCTOR) return;
  const now = new Date();

  const soon = await prisma.appointment.findMany({
    where: {
      doctorId: user.id,
      status: "CONFIRMED",
      startsAt: { gte: now, lte: new Date(now.getTime() + REMINDER_WINDOW_MS) },
    },
    include: { patient: { select: { firstName: true, lastName: true } } },
  });
  if (soon.length === 0) return;

  await prisma.notification.createMany({
    data: soon.map((a) => ({
      userId: user.id,
      type: "APPOINTMENT_REMINDER" as const,
      title: "Upcoming appointment",
      body: `${a.patient.firstName} ${a.patient.lastName} · ${a.title}`,
      link: `/doctor/appointments/${a.id}`,
      dedupeKey: `reminder:${a.id}:${user.id}`,
    })),
    skipDuplicates: true,
  });
}
