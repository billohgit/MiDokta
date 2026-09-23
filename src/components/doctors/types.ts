import type { Gender } from "@prisma/client";

export type Hospital = { id: string; name: string };

export type DoctorRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  smsOptIn: boolean;
  avatarUrl: string | null;
  gender: Gender | null;
  specialty: string | null;
  licenseNumber: string | null;
  experienceYears: number | null;
  bio: string | null;
  isActive: boolean;
  hospital: Hospital | null;
  totalAppointments: number;
  upcomingAppointments: number;
};
