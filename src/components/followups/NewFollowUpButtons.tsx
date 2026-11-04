"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createReferralAction, orderTestAction } from "@/app/actions/followups";
import Modal from "@/components/ui/Modal";
import useServerAction from "@/components/ui/useServerAction";
import type { PersonOption } from "./shared";

type Props = { patientId: string; recordId?: string; doctors: PersonOption[]; navigators: PersonOption[] };

/** A doctor's "Order test" and "Refer" buttons on a patient's page. */
export default function NewFollowUpButtons({ patientId, recordId, doctors, navigators }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState<"test" | "referral" | null>(null);
  const [external, setExternal] = useState(false);
  const { busy, error, setError, submitWith } = useServerAction();
  const close = () => {
    setOpen(null);
    setError(null);
  };
  const done = (kind: "tests" | "referrals") => (r: { id?: string }) => {
    close();
    if (r.id) router.push(`/doctor/follow-ups/${kind}/${r.id}`);
  };

  return (
    <>
      <button className="btn btn-outline btn-sm" onClick={() => setOpen("test")}>
        <i className="fa-solid fa-vial btn-icon" /> Order test
      </button>
      <button className="btn btn-outline btn-sm" onClick={() => setOpen("referral")}>
        <i className="fa-solid fa-share-from-square btn-icon" /> Refer
      </button>

      {open === "test" && (
        <Modal title="Order a test" onClose={close}>
          <form className="form-grid" onSubmit={submitWith(orderTestAction, { onSuccess: done("tests") })}>
            <input type="hidden" name="patientId" value={patientId} />
            {recordId && <input type="hidden" name="recordId" value={recordId} />}
            <label className="field full">
              <span>Test *</span>
              <input name="name" maxLength={120} required placeholder="e.g. Full blood count, Malaria RDT, Chest X-ray" />
            </label>
            <label className="field">
              <span>Kind</span>
              <select name="kind" defaultValue="LAB">
                <option value="LAB">Lab</option>
                <option value="IMAGING">Imaging</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label className="field">
              <span>Urgency</span>
              <select name="urgency" defaultValue="ROUTINE">
                <option value="ROUTINE">Routine</option>
                <option value="URGENT">Urgent</option>
                <option value="EMERGENCY">Emergency</option>
              </select>
            </label>
            <label className="field full">
              <span>Clinical question</span>
              <input name="question" maxLength={500} placeholder="What do you want to know?" />
            </label>
            <label className="field full">
              <span>Result expected by</span>
              <input name="dueAt" type="date" />
              <small className="form-note">Leave empty to use the usual time for this kind of test and urgency.</small>
            </label>
            {error && <p className="form-error full">{error}</p>}
            <div className="modal-actions full">
              <button type="button" className="btn btn-outline" onClick={close}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? "Ordering..." : "Order test"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {open === "referral" && (
        <Modal title="Refer the patient" onClose={close}>
          <form className="form-grid" onSubmit={submitWith(createReferralAction, { onSuccess: done("referrals") })}>
            <input type="hidden" name="patientId" value={patientId} />
            {recordId && <input type="hidden" name="recordId" value={recordId} />}
            <fieldset className="field full">
              <span>Refer to</span>
              <label className="checkbox-line">
                <input type="radio" checked={!external} onChange={() => setExternal(false)} /> A doctor on MiDokta
              </label>
              <label className="checkbox-line">
                <input type="radio" checked={external} onChange={() => setExternal(true)} /> A hospital or specialist outside MiDokta
              </label>
            </fieldset>
            {external ? (
              <label className="field full">
                <span>Facility or specialist *</span>
                <input name="toFacility" maxLength={200} required placeholder="e.g. Connaught Hospital, Cardiology clinic" />
              </label>
            ) : (
              <label className="field full">
                <span>Doctor *</span>
                <select name="toDoctorId" required defaultValue="">
                  <option value="" disabled>
                    Choose a doctor
                  </option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                      {d.detail ? ` · ${d.detail}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              <span>Specialty *</span>
              <input name="specialty" maxLength={80} required placeholder="e.g. Cardiology" />
            </label>
            <label className="field">
              <span>Urgency</span>
              <select name="urgency" defaultValue="ROUTINE">
                <option value="ROUTINE">Routine</option>
                <option value="URGENT">Urgent</option>
                <option value="EMERGENCY">Emergency</option>
              </select>
            </label>
            <label className="field full">
              <span>Reason *</span>
              <textarea name="reason" rows={3} maxLength={1000} required placeholder="Findings so far and what you need the specialist to do" />
            </label>
            <label className="field full">
              <span>Care navigator</span>
              <select name="navigatorId" defaultValue="">
                <option value="">Anyone at the front desk (assign later)</option>
                {navigators.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                    {n.detail ? ` (${n.detail})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="field full">
              <span>Instructions for the patient</span>
              <textarea name="patientInstructions" rows={2} maxLength={600} placeholder="Where to go and what to bring, if you know already" />
            </label>
            {error && <p className="form-error full">{error}</p>}
            <div className="modal-actions full">
              <button type="button" className="btn btn-outline" onClick={close}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? "Referring..." : "Refer"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
