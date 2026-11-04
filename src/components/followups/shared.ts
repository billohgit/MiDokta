import type { ReferralStatus, TestKind, TestStatus, Urgency } from "@prisma/client";

export const TEST_STATUS_LABEL: Record<TestStatus, string> = {
  ORDERED: "Ordered",
  COLLECTED: "Sample collected",
  RESULTED: "Result in · to review",
  REVIEWED: "Reviewed · tell patient",
  COMMUNICATED: "Patient told",
  CANCELLED: "Cancelled",
};

export const REFERRAL_STATUS_LABEL: Record<ReferralStatus, string> = {
  CREATED: "To book",
  SCHEDULED: "Booked",
  ATTENDED: "Attended · awaiting report",
  REPORT_RECEIVED: "Report in · close loop",
  CLOSED: "Loop closed",
  CANCELLED: "Cancelled",
};

const DONE = "status-confirmed";
const WAITING = "status-pending";

export const TEST_STATUS_CLASS: Record<TestStatus, string> = {
  ORDERED: WAITING,
  COLLECTED: WAITING,
  RESULTED: "status-rejected",
  REVIEWED: "status-rejected",
  COMMUNICATED: DONE,
  CANCELLED: "status-void",
};

export const REFERRAL_STATUS_CLASS: Record<ReferralStatus, string> = {
  CREATED: "status-rejected",
  SCHEDULED: WAITING,
  ATTENDED: WAITING,
  REPORT_RECEIVED: "status-rejected",
  CLOSED: DONE,
  CANCELLED: "status-void",
};

export const URGENCY_LABEL: Record<Urgency, string> = { ROUTINE: "Routine", URGENT: "Urgent", EMERGENCY: "Emergency" };
export const URGENCY_CLASS: Record<Urgency, string> = { ROUTINE: "status-neutral", URGENT: "status-pending", EMERGENCY: "status-rejected" };
export const KIND_LABEL: Record<TestKind, string> = { LAB: "Lab", IMAGING: "Imaging", OTHER: "Other" };

/** A person to pick from (a doctor to refer to, or a navigator). */
export type PersonOption = { id: string; name: string; detail?: string | null };
