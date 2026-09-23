import type { User } from "@prisma/client";
import Avatar from "@/components/appointments/Avatar";
import { formatDate } from "@/components/appointments/shared";
import { GENDER_LABEL, ageFrom, displayEmail } from "@/lib/people";

type Props = { patient: User; actions?: React.ReactNode; compact?: boolean };

/** Patient header with medical alerts and contact details. Server component. */
export default function PatientSummary({ patient, actions, compact }: Props) {
  const age = ageFrom(patient.dateOfBirth);
  const facts = [
    age !== null ? `${age} yrs` : null,
    patient.gender ? GENDER_LABEL[patient.gender] : null,
    patient.bloodGroup ? `Blood ${patient.bloodGroup}` : null,
  ].filter(Boolean);

  const details: [string, string | null][] = [
    ["Phone", patient.phone],
    ["Email", displayEmail(patient.email)],
    ["Date of Birth", patient.dateOfBirth ? formatDate(patient.dateOfBirth.toISOString()) : null],
    ["Address", [patient.address, patient.city].filter(Boolean).join(", ") || null],
    [
      "Emergency Contact",
      [patient.emergencyContactName, patient.emergencyContactPhone].filter(Boolean).join(" · ") || null,
    ],
    ["Registered", formatDate(patient.createdAt.toISOString())],
  ];

  return (
    <>
      <section className="card profile-card doctor-profile">
        <Avatar person={patient} size={compact ? 80 : 110} />
        <div className="doctor-profile-main">
          <h2 className="profile-name">
            {patient.firstName} {patient.lastName}
          </h2>
          <p className="profile-role">{facts.join(" · ") || "Patient"}</p>
          {!patient.isActive && <span className="status-pill status-cancelled">Inactive</span>}
        </div>
        {actions}
      </section>

      {(patient.allergies || patient.chronicConditions) && (
        <section className="medical-alerts">
          {patient.allergies && (
            <div className="medical-alert danger">
              <i className="fa-solid fa-triangle-exclamation" />
              <div>
                <strong>Allergies</strong>
                <p>{patient.allergies}</p>
              </div>
            </div>
          )}
          {patient.chronicConditions && (
            <div className="medical-alert warn">
              <i className="fa-solid fa-heart-pulse" />
              <div>
                <strong>Chronic conditions</strong>
                <p>{patient.chronicConditions}</p>
              </div>
            </div>
          )}
        </section>
      )}

      {!compact && (
        <section className="card details-card">
          <div className="details-head">
            <h3>Basic Detail</h3>
          </div>
          <div className="details-grid">
            {details.map(([label, value]) => (
              <div key={label} className="detail-row">
                <span className="detail-label">{label}:</span>
                <span className="detail-value">{value || "—"}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
