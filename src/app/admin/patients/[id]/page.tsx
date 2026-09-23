import PatientDetailPage from "@/components/patients/PatientDetailPage";

export const dynamic = "force-dynamic";

export default async function AdminPatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PatientDetailPage id={id} basePath="/admin" canManage canDelete />;
}
