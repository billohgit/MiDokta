import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { STAFF_PORTAL_ROLES } from "@/lib/roles";
import PatientsPage from "@/components/patients/PatientsPage";

export const dynamic = "force-dynamic";

export default async function StaffPatientsPage() {
  const staff = await requireUser(...STAFF_PORTAL_ROLES);
  return <PatientsPage basePath="/staff" canRegister={staff.role === Role.RECEPTIONIST} />;
}
