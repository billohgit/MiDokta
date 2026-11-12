import type { MalariaCaseStatus } from "@prisma/client";

/** Labels for malaria cases, shared by the server and the browser. */

export const STATUS_LABEL: Record<MalariaCaseStatus, string> = {
  REFERRED: "Referred for a test",
  NEGATIVE: "Tested negative",
  POSITIVE: "Positive: waiting for treatment plan",
  TREATMENT: "On treatment",
  COMPLETED: "Treatment completed",
  INCOMPLETE: "Needs follow-up",
  CANCELLED: "Cancelled",
};

export const STATUS_CLASS: Record<MalariaCaseStatus, string> = {
  REFERRED: "status-pending",
  NEGATIVE: "status-neutral",
  POSITIVE: "status-rejected",
  TREATMENT: "status-completed",
  COMPLETED: "status-confirmed",
  INCOMPLETE: "status-rejected",
  CANCELLED: "status-neutral",
};

export const FOR_WHOM_LABEL: Record<string, string> = { SELF: "Adult", CHILD: "Child under 5", PREGNANT: "Pregnant" };

export const OUTCOME_LABEL: Record<string, string> = { LOW: "Unlikely", SUSPECTED: "Suspected", DANGER: "Danger signs" };
