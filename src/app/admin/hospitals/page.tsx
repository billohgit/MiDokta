import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import HospitalsView, { type HospitalRow } from "@/components/hospitals/HospitalsView";

export const dynamic = "force-dynamic";

export default async function AdminHospitalsPage() {
  const [hospitals, doctorCounts] = await Promise.all([
    prisma.hospital.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: { _count: { select: { staff: true, appointments: true } } },
    }),
    prisma.user.groupBy({
      by: ["hospitalId"],
      where: { role: Role.DOCTOR, isActive: true, hospitalId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const rows: HospitalRow[] = hospitals.map((h) => ({
    id: h.id,
    name: h.name,
    address: h.address,
    city: h.city,
    phone: h.phone,
    email: h.email,
    isActive: h.isActive,
    staff: h._count.staff,
    doctors: doctorCounts.find((d) => d.hospitalId === h.id)?._count._all ?? 0,
    appointments: h._count.appointments,
  }));

  return <HospitalsView hospitals={rows} />;
}
