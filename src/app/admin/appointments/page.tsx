import AppointmentsPage from "@/components/appointments/AppointmentsPage";

export const dynamic = "force-dynamic";

export default function AdminAppointmentsPage() {
  return <AppointmentsPage basePath="/admin" />;
}
