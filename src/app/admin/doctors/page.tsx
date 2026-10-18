import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ratingSummaries } from "@/lib/ratings";
import DoctorsView from "@/components/doctors/DoctorsView";
import type { DoctorRow } from "@/components/doctors/types";

export const dynamic = "force-dynamic";

export default async function AdminDoctorsPage() {
  const [doctors, upcoming, hospitals, ratings] = await Promise.all([
    prisma.user.findMany({
      where: { role: Role.DOCTOR },
      orderBy: [{ isActive: "desc" }, { firstName: "asc" }],
      include: {
        hospital: { select: { id: true, name: true } },
        _count: { select: { doctorAppointments: true } },
      },
    }),
    prisma.appointment.groupBy({
      by: ["doctorId"],
      where: { doctorId: { not: null }, status: "CONFIRMED", startsAt: { gte: new Date() } },
      _count: { _all: true },
    }),
    prisma.hospital.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ratingSummaries(),
  ]);

  const rows: DoctorRow[] = doctors.map((d) => ({
    id: d.id,
    firstName: d.firstName,
    lastName: d.lastName,
    email: d.email,
    phone: d.phone,
    smsOptIn: d.smsOptIn,
    avatarUrl: d.avatarUrl,
    gender: d.gender,
    specialty: d.specialty,
    licenseNumber: d.licenseNumber,
    experienceYears: d.experienceYears,
    bio: d.bio,
    isActive: d.isActive,
    hospital: d.hospital,
    totalAppointments: d._count.doctorAppointments,
    upcomingAppointments: upcoming.find((u) => u.doctorId === d.id)?._count._all ?? 0,
    rating: ratings.get(d.id) ?? null,
  }));

  return <DoctorsView doctors={rows} hospitals={hospitals} />;
}
