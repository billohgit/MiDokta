import type { AppointmentStatus, VisitType } from "@prisma/client";

export type Person = { id: string; firstName: string; lastName: string; avatarUrl: string | null };

export type AppointmentRow = {
  id: string;
  title: string;
  startsAt: string;
  status: AppointmentStatus;
  visitType: VisitType;
  patient: Person;
  doctor: Person | null;
};

export const fullName = (p: Person | null) => (p ? `${p.firstName} ${p.lastName}` : "");

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }).toLowerCase();

export const VISIT_LABEL: Record<VisitType, string> = { IN_PERSON: "In-Person", VIDEO_CALL: "Video Call" };

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};
