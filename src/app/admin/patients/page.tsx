import PatientsPage from "@/components/patients/PatientsPage";

export const dynamic = "force-dynamic";

export default function AdminPatientsPage() {
  return <PatientsPage basePath="/admin" canRegister />;
}
