/**
 * Who can do what, in one place.
 *
 * Roles are written as string literals rather than imported from `@prisma/client`
 * as values, so client components can import this without pulling Prisma into the
 * browser bundle.
 */

import type { Role } from "@prisma/client";

/** Nurses, pharmacists and receptionists share one portal; the pages they see differ by role. */
export const STAFF_PORTAL_ROLES: Role[] = ["NURSE", "PHARMACIST", "RECEPTIONIST"];

/** Every role with a portal to sign in to. Patients sign in with a code texted to their phone. */
export const PORTAL_ROLES: Role[] = ["ADMIN", "DOCTOR", ...STAFF_PORTAL_ROLES, "PATIENT"];

/** Roles that place and answer video calls with each other (doctors and their patients). */
export const CALL_ROLES: Role[] = ["DOCTOR", "PATIENT"];

/** Roles people may pick when creating their own account. Admins are only made by other admins. */
export const SIGNUP_ROLES = ["DOCTOR", "NURSE", "PHARMACIST", "RECEPTIONIST"] as const satisfies readonly Role[];

/** Runs the front desk: scheduling, registering patients, invoicing and taking payments. */
export const FRONT_DESK_ROLES: Role[] = ["ADMIN", "RECEPTIONIST"];

/** May read patient medical records. */
export const CLINICAL_ROLES: Role[] = ["ADMIN", "DOCTOR", "NURSE", "PHARMACIST"];

/** The portal root for each role that has one, e.g. "/admin". */
export const PORTAL_BASE: Partial<Record<Role, string>> = {
  ADMIN: "/admin",
  DOCTOR: "/doctor",
  NURSE: "/staff",
  PHARMACIST: "/staff",
  RECEPTIONIST: "/staff",
  PATIENT: "/patient",
};
