"use client";

import { scheduleAppointment } from "@/app/actions/appointments";
import Modal from "@/components/ui/Modal";
import useServerAction from "@/components/ui/useServerAction";
import { type Person, fullName } from "./shared";

/** `doctors` is null when a doctor is scheduling for themselves. */
type Props = { patients: Person[]; doctors: Person[] | null; onClose: () => void };

export default function ScheduleModal({ patients, doctors, onClose }: Props) {
  const { busy: saving, error, submitWith } = useServerAction();

  return (
    <Modal title="Schedule Appointment" onClose={onClose}>
      <form onSubmit={submitWith(scheduleAppointment, { onSuccess: onClose })} className="form-grid">
        <label className="field full">
          <span>Patient</span>
          <select name="patientId" required defaultValue="">
            <option value="" disabled>
              Select a patient
            </option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {fullName(p)}
              </option>
            ))}
          </select>
        </label>

        {doctors && (
          <label className="field full">
            <span>Doctor</span>
            <select name="doctorId" defaultValue="">
              <option value="">Unassigned (pending request)</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  Dr. {fullName(d)}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="field">
          <span>Date</span>
          <input type="date" name="date" required />
        </label>

        <label className="field">
          <span>Time</span>
          <input type="time" name="time" required />
        </label>

        <label className="field">
          <span>Visit Type</span>
          <select name="visitType" defaultValue="IN_PERSON">
            <option value="IN_PERSON">In-Person</option>
            <option value="VIDEO_CALL">Video Call</option>
          </select>
        </label>

        <label className="field">
          <span>Reason</span>
          <input name="title" placeholder="Consultation" />
        </label>

        {error && <p className="form-error full">{error}</p>}

        <div className="modal-actions full">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Schedule"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
