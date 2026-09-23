import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { STAFF_PORTAL_ROLES } from "@/lib/roles";
import PatientDetailPage from "@/components/patients/PatientDetailPage";

export const dynamic = "force-dynamic";

export default async function StaffPatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [staff, { id }] = await Promise.all([requireUser(...STAFF_PORTAL_ROLES), params]);
  // Only the front desk edits patients and raises invoices; deleting stays with admins.
  return <PatientDetailPage id={id} basePath="/staff" canManage={staff.role === Role.RECEPTIONIST} />;
}
