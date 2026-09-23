import type { User } from "@prisma/client";
import type { Profile } from "@/components/settings/ProfileSettings";

export function initialsOf(user: { firstName: string; lastName: string }) {
  const words = `${user.firstName} ${user.lastName}`.trim().split(/\s+/);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export const topbarUser = (user: User) => ({ initials: initialsOf(user), avatarUrl: user.avatarUrl });

export const personSelect = { id: true, firstName: true, lastName: true, avatarUrl: true } as const;

export function toProfile(user: User): Profile {
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    avatarUrl: user.avatarUrl,
    phone: user.phone,
    smsOptIn: user.smsOptIn,
    dateOfBirth: user.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    gender: user.gender,
    address: user.address,
    city: user.city,
    state: user.state,
    country: user.country,
    zipCode: user.zipCode,
  };
}

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

export const GENDER_LABEL = { MALE: "Male", FEMALE: "Female", OTHER: "Other" } as const;

/** Patients without an email get a unique placeholder address, since email is the account key. */
const PLACEHOLDER_EMAIL_DOMAIN = "no-email.invalid";

export const placeholderEmail = () => `patient-${crypto.randomUUID()}@${PLACEHOLDER_EMAIL_DOMAIN}`;

export const displayEmail = (email: string) => (email.endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`) ? null : email);

/** Whole years between a date of birth and now. */
export function ageFrom(dateOfBirth: Date | string | null, now = new Date()) {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  if (now.getUTCMonth() < dob.getUTCMonth() || (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate())) {
    age--;
  }
  return age;
}
