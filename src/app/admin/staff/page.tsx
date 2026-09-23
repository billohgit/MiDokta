import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import StaffView, { type StaffRow } from "@/components/staff/StaffView";

export const dynamic = "force-dynamic";

export default async function AdminStaffPage() {
  const me = await requireUser(Role.ADMIN);

  const [staff, hospitals] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: [Role.ADMIN, Role.NURSE, Role.PHARMACIST, Role.RECEPTIONIST] } },
      orderBy: [{ isActive: "desc" }, { firstName: "asc" }],
      include: { hospital: { select: { id: true, name: true } } },
    }),
    prisma.hospital.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const rows: StaffRow[] = staff.map((s) => ({
    id: s.id,
    firstName: s.firstName,
    lastName: s.lastName,
    email: s.email,
    phone: s.phone,
    smsOptIn: s.smsOptIn,
    avatarUrl: s.avatarUrl,
    gender: s.gender,
    role: s.role as StaffRow["role"],
    isActive: s.isActive,
    hospital: s.hospital,
  }));

  return <StaffView staff={rows} hospitals={hospitals} currentUserId={me.id} />;
}
