import type { Gender } from "@prisma/client";

/** Editable patient fields, as passed to the patient form. */
export type PatientFormData = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  smsOptIn: boolean;
  gender: Gender | null;
  dateOfBirth: string | null; // YYYY-MM-DD
  bloodGroup: string | null;
  allergies: string | null;
  chronicConditions: string | null;
  address: string | null;
  city: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
};

export type PatientRow = PatientFormData & {
  avatarUrl: string | null;
  isActive: boolean;
  age: number | null;
  lastVisit: string | null;
  nextAppointment: string | null;
};
