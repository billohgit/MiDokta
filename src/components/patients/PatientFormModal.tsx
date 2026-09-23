"use client";

import { savePatient } from "@/app/actions/patients";
import Modal from "@/components/ui/Modal";
import useServerAction from "@/components/ui/useServerAction";
import { BLOOD_GROUPS } from "@/lib/people";
import type { PatientFormData } from "./types";

type Props = { patient: PatientFormData | null; onClose: () => void; onSaved?: (id: string) => void };

export default function PatientFormModal({ patient, onClose, onSaved }: Props) {
  const { busy, error, submitWith } = useServerAction();

  return (
    <Modal
      title={patient ? `Edit ${patient.firstName} ${patient.lastName}` : "Register Patient"}
      onClose={onClose}
      wide
    >
      <form
        onSubmit={submitWith(savePatient, {
          onSuccess: (r) => {
            onClose();
            if (r.id) onSaved?.(r.id);
          },
        })}
        className="form-grid"
      >
        <input type="hidden" name="id" value={patient?.id ?? ""} />

        <p className="form-section full">Personal details</p>
        <label className="field">
          <span>First Name *</span>
          <input name="firstName" defaultValue={patient?.firstName} required />
        </label>
        <label className="field">
          <span>Last Name *</span>
          <input name="lastName" defaultValue={patient?.lastName} required />
        </label>
        <label className="field">
          <span>Gender</span>
          <select name="gender" defaultValue={patient?.gender ?? ""}>
            <option value="">Not specified</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label className="field">
          <span>Date of Birth</span>
          <input
            type="date"
            name="dateOfBirth"
            defaultValue={patient?.dateOfBirth ?? ""}
            max={new Date().toISOString().slice(0, 10)}
          />
        </label>
        <label className="field">
          <span>Phone</span>
          <input type="tel" name="phone" defaultValue={patient?.phone ?? ""} placeholder="+232 76 123 456" />
        </label>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            name="email"
            defaultValue={patient?.email ?? ""}
            placeholder="Optional"
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span>Address</span>
          <input name="address" defaultValue={patient?.address ?? ""} />
        </label>
        <label className="field">
          <span>City</span>
          <input name="city" defaultValue={patient?.city ?? ""} />
        </label>

        <label className="field sms-opt">
          <span>SMS notifications</span>
          <span className="checkbox-line">
            <input type="checkbox" name="smsOptIn" defaultChecked={patient?.smsOptIn ?? true} /> Send text messages to
            this phone
          </span>
        </label>
        <span className="full-hide" />

        <p className="form-section full">Medical information</p>
        <label className="field">
          <span>Blood Group</span>
          <select name="bloodGroup" defaultValue={patient?.bloodGroup ?? ""}>
            <option value="">Unknown</option>
            {BLOOD_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <span className="full-hide" />
        <label className="field">
          <span>Allergies</span>
          <textarea name="allergies" rows={2} defaultValue={patient?.allergies ?? ""} placeholder="e.g. Penicillin" />
        </label>
        <label className="field">
          <span>Chronic Conditions</span>
          <textarea
            name="chronicConditions"
            rows={2}
            defaultValue={patient?.chronicConditions ?? ""}
            placeholder="e.g. Hypertension"
          />
        </label>

        <p className="form-section full">Emergency contact</p>
        <label className="field">
          <span>Name</span>
          <input name="emergencyContactName" defaultValue={patient?.emergencyContactName ?? ""} />
        </label>
        <label className="field">
          <span>Phone</span>
          <input type="tel" name="emergencyContactPhone" defaultValue={patient?.emergencyContactPhone ?? ""} />
        </label>

        {error && <p className="form-error full">{error}</p>}
        <div className="modal-actions full">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving..." : patient ? "Save Changes" : "Register Patient"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
