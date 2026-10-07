"use client";

import { useState } from "react";
import { requestAppointment } from "@/app/actions/patient-portal";
import Modal from "@/components/ui/Modal";
import useServerAction from "@/components/ui/useServerAction";

type Doctor = { id: string; name: string; specialty: string | null };

/** "Request an appointment" button and form. The clinic or the doctor confirms the time. */
export default function RequestAppointmentButton({ doctors }: { doctors: Doctor[] }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const { busy, error, setError, submitWith } = useServerAction();
  const today = new Date().toLocaleDateString("en-CA");

  const close = () => {
    setOpen(false);
    setDone(false);
    setError(null);
  };

  return (
    <>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        <i className="fa-solid fa-plus btn-icon" /> Request appointment
      </button>
      {open && (
        <Modal title="Request an appointment" onClose={close}>
          {done ? (
            <>
              <p className="form-note">
                <i className="fa-solid fa-circle-check" /> Request sent. You&apos;ll be told here (and by text) once it&apos;s confirmed.
              </p>
              <div className="modal-actions">
                <button type="button" className="btn btn-primary" onClick={close}>
                  Done
                </button>
              </div>
            </>
          ) : (
            <form className="form-grid" onSubmit={submitWith(requestAppointment, { onSuccess: () => setDone(true) })}>
              <label className="field full">
                <span>Doctor</span>
                <select name="doctorId" defaultValue="">
                  <option value="">Any available doctor</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                      {d.specialty ? ` · ${d.specialty}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Date *</span>
                <input type="date" name="date" min={today} required />
              </label>
              <label className="field">
                <span>Time *</span>
                <input type="time" name="time" required />
              </label>
              <label className="field full">
                <span>Visit</span>
                <select name="visitType" defaultValue="IN_PERSON">
                  <option value="IN_PERSON">In person at the clinic</option>
                  <option value="VIDEO_CALL">Video call (the doctor calls you in the app)</option>
                </select>
              </label>
              <label className="field full">
                <span>Reason</span>
                <input name="title" maxLength={120} placeholder="e.g. Fever and headache" />
              </label>
              {error && <p className="form-error full">{error}</p>}
              <div className="modal-actions full">
                <button type="button" className="btn btn-outline" onClick={close}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? "Sending..." : "Send request"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
