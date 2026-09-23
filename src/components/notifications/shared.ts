import type { NotificationType } from "@prisma/client";

export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

export const NOTIFICATION_ICON: Record<NotificationType, string> = {
  APPOINTMENT_REQUEST: "fa-inbox",
  APPOINTMENT_ASSIGNED: "fa-user-doctor",
  APPOINTMENT_CONFIRMED: "fa-calendar-check",
  APPOINTMENT_REJECTED: "fa-calendar-xmark",
  APPOINTMENT_CANCELLED: "fa-ban",
  APPOINTMENT_COMPLETED: "fa-circle-check",
  APPOINTMENT_REMINDER: "fa-clock",
  PAYMENT_RECEIVED: "fa-money-bill-wave",
  STOCK_LOW: "fa-triangle-exclamation",
  GENERAL: "fa-bell",
};

export function timeAgo(iso: string, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
