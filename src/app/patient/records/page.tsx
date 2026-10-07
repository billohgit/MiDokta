import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { patientRecords } from "@/lib/records";
import MedicalHistory from "@/components/records/MedicalHistory";

export const dynamic = "force-dynamic";

/** The patient's own visit notes: diagnoses, vitals and prescriptions. */
export default async function PatientRecordsPage() {
  const patient = await requireUser(Role.PATIENT);
  const records = await patientRecords(patient.id);

  return (
    <div className="settings">
      <div className="appt-header">
        <div>
          <h2 className="section-heading">My Records</h2>
          <p className="section-sub">Your visits, diagnoses and prescriptions.</p>
        </div>
      </div>
      <MedicalHistory records={records} emptyText="Your visit records will appear here after you see a doctor." />
    </div>
  );
}
