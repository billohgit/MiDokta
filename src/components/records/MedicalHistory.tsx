import type { RecordWithDetails } from "@/lib/records";
import { formatDate } from "@/components/appointments/shared";

type Props = { records: RecordWithDetails[]; emptyText?: string };

/** Timeline of consultations with vitals and prescriptions. Server component. */
export default function MedicalHistory({ records, emptyText = "No medical records yet." }: Props) {
  if (records.length === 0) return <div className="empty-banner">{emptyText}</div>;

  return (
    <div className="record-timeline">
      {records.map((r) => {
        const vitals = [
          r.temperature !== null && `Temp ${r.temperature.toString()} °C`,
          r.bloodPressure && `BP ${r.bloodPressure}`,
          r.heartRate !== null && `HR ${r.heartRate} bpm`,
          r.respiratoryRate !== null && `RR ${r.respiratoryRate}/min`,
          r.oxygenSaturation !== null && `SpO₂ ${r.oxygenSaturation}%`,
          r.weight !== null && `Wt ${r.weight.toString()} kg`,
          r.height !== null && `Ht ${r.height.toString()} cm`,
        ].filter(Boolean) as string[];

        return (
          <article key={r.id} className="card record-card">
            <header className="record-head">
              <div>
                <span className="record-date">{formatDate((r.appointment?.startsAt ?? r.createdAt).toISOString())}</span>
                <h4 className="record-diagnosis">{r.diagnosis}</h4>
                <p className="record-doctor">
                  Dr. {r.doctor.firstName} {r.doctor.lastName}
                  {r.doctor.specialty && ` · ${r.doctor.specialty}`}
                  {r.appointment && ` · ${r.appointment.title}`}
                </p>
              </div>
              {r.followUpDate && (
                <span className="status-pill status-pending">Follow-up {formatDate(r.followUpDate.toISOString())}</span>
              )}
            </header>

            {r.chiefComplaint && (
              <p className="record-line">
                <strong>Complaint:</strong> {r.chiefComplaint}
              </p>
            )}
            {vitals.length > 0 && (
              <div className="vitals-row">
                {vitals.map((v) => (
                  <span key={v} className="vital-chip">
                    {v}
                  </span>
                ))}
              </div>
            )}
            {r.notes && <p className="record-notes">{r.notes}</p>}

            {r.prescriptions.length > 0 && (
              <div className="table-wrap">
                <table className="appt-table rx-table">
                  <thead>
                    <tr>
                      <th>Medication</th>
                      <th>Dosage</th>
                      <th>Frequency</th>
                      <th>Duration</th>
                      <th>Instructions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.prescriptions.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <i className="fa-solid fa-prescription-bottle-medical rx-icon" /> {p.medication}
                        </td>
                        <td>{p.dosage}</td>
                        <td>{p.frequency}</td>
                        <td>{p.duration}</td>
                        <td>{p.instructions ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
