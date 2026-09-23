"use client";

import { saveDoctor } from "@/app/actions/doctors";
import Modal from "@/components/ui/Modal";
import useServerAction from "@/components/ui/useServerAction";
import type { DoctorRow, Hospital } from "./types";

type Props = { doctor: DoctorRow | null; hospitals: Hospital[]; onClose: () => void };

export default function DoctorFormModal({ doctor, hospitals, onClose }: Props) {
  const { busy: saving, error, submitWith } = useServerAction();
  const isNew = !doctor;

  return (
    <Modal title={isNew ? "Add Doctor" : `Edit Dr. ${doctor.firstName} ${doctor.lastName}`} onClose={onClose} wide>
      <form onSubmit={submitWith(saveDoctor, { onSuccess: onClose })} className="form-grid">
        <input type="hidden" name="id" value={doctor?.id ?? ""} />

        <label className="field">
          <span>First Name *</span>
          <input name="firstName" defaultValue={doctor?.firstName} required />
        </label>
        <label className="field">
          <span>Last Name *</span>
          <input name="lastName" defaultValue={doctor?.lastName} required />
        </label>

        <label className="field">
          <span>Email *</span>
          <input type="email" name="email" defaultValue={doctor?.email} required autoComplete="off" />
        </label>
        <label className="field">
          <span>Phone</span>
          <input type="tel" name="phone" defaultValue={doctor?.phone ?? ""} placeholder="+232 76 123 456" />
        </label>
        <label className="field sms-opt">
          <span>SMS notifications</span>
          <span className="checkbox-line">
            <input type="checkbox" name="smsOptIn" defaultChecked={doctor?.smsOptIn ?? true} /> Send text messages to
            this phone
          </span>
        </label>
        <span className="full-hide" />

        <label className="field">
          <span>Specialty</span>
          <input name="specialty" defaultValue={doctor?.specialty ?? ""} placeholder="e.g. Cardiology" />
        </label>
        <label className="field">
          <span>Hospital</span>
          <select name="hospitalId" defaultValue={doctor?.hospital?.id ?? ""}>
            <option value="">Not assigned</option>
            {hospitals.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>License Number</span>
          <input name="licenseNumber" defaultValue={doctor?.licenseNumber ?? ""} />
        </label>
        <label className="field">
          <span>Years of Experience</span>
          <input type="number" name="experienceYears" min={0} max={70} defaultValue={doctor?.experienceYears ?? ""} />
        </label>

        <label className="field">
          <span>Gender</span>
          <select name="gender" defaultValue={doctor?.gender ?? ""}>
            <option value="">Prefer not to say</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label className="field">
          <span>{isNew ? "Password *" : "New Password"}</span>
          <input
            type="password"
            name="password"
            minLength={8}
            required={isNew}
            autoComplete="new-password"
            placeholder={isNew ? "At least 8 characters" : "Leave blank to keep current"}
          />
        </label>

        <label className="field full">
          <span>Bio</span>
          <textarea name="bio" rows={3} defaultValue={doctor?.bio ?? ""} />
        </label>

        {error && <p className="form-error full">{error}</p>}

        <div className="modal-actions full">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving..." : isNew ? "Add Doctor" : "Save Changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
