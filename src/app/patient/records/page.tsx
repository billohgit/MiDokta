import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { patientRecords } from "@/lib/records";
import MedicalHistory from "@/components/records/MedicalHistory";
import MyFollowUps from "@/components/followups/MyFollowUps";

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
          <p className="section-sub">Your visits, diagnoses, prescriptions, tests and referrals.</p>
        </div>
      </div>
      <MedicalHistory records={records} emptyText="Your visit records will appear here after you see a doctor." />
      <MyFollowUps patientId={patient.id} />
    </div>
  );
}
