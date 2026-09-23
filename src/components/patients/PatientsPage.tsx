import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ageFrom, displayEmail } from "@/lib/people";
import PatientsView from "./PatientsView";
import type { PatientRow } from "./types";

type Props = {
  basePath: string;
  /** Front-desk roles can register new patients; clinical staff read the list. */
  canRegister?: boolean;
};

/** The patient register, shared by the admin and staff portals. */
export default async function PatientsPage({ basePath, canRegister = false }: Props) {
  const now = new Date();
  const [patients, lastVisits, nextVisits] = await Promise.all([
    prisma.user.findMany({ where: { role: Role.PATIENT }, orderBy: [{ isActive: "desc" }, { firstName: "asc" }] }),
    prisma.appointment.groupBy({ by: ["patientId"], where: { status: "COMPLETED" }, _max: { startsAt: true } }),
    prisma.appointment.groupBy({
      by: ["patientId"],
      where: { status: "CONFIRMED", startsAt: { gte: now } },
      _min: { startsAt: true },
    }),
  ]);

  const rows: PatientRow[] = patients.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    email: displayEmail(p.email),
    phone: p.phone,
    smsOptIn: p.smsOptIn,
    gender: p.gender,
    dateOfBirth: p.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    bloodGroup: p.bloodGroup,
    allergies: p.allergies,
    chronicConditions: p.chronicConditions,
    address: p.address,
    city: p.city,
    emergencyContactName: p.emergencyContactName,
    emergencyContactPhone: p.emergencyContactPhone,
    avatarUrl: p.avatarUrl,
    isActive: p.isActive,
    age: ageFrom(p.dateOfBirth, now),
    lastVisit: lastVisits.find((v) => v.patientId === p.id)?._max.startsAt?.toISOString() ?? null,
    nextAppointment: nextVisits.find((v) => v.patientId === p.id)?._min.startsAt?.toISOString() ?? null,
  }));

  return <PatientsView patients={rows} basePath={basePath} canRegister={canRegister} />;
}
