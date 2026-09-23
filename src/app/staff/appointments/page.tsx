import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import AppointmentsPage from "@/components/appointments/AppointmentsPage";

export const dynamic = "force-dynamic";

export default async function ReceptionAppointmentsPage() {
  await requireUser(Role.RECEPTIONIST);
  return <AppointmentsPage basePath="/staff" />;
}
