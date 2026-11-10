"use client";

import { useState } from "react";
import { cancelInvite, inviteNewPatient } from "@/app/actions/invites";
import Modal from "@/components/ui/Modal";
import PhoneInput from "@/components/ui/PhoneInput";
import useServerAction from "@/components/ui/useServerAction";

export type InviteRow = {
  id: string;
  name: string;
  phone: string;
  visit: string;
  status: "waiting" | "registered" | "paid" | "confirmed" | "cancelled" | "expired";
};

const STATUS: Record<InviteRow["status"], { label: string; className: string }> = {
  waiting: { label: "Waiting for them to register", className: "status-pending" },
  registered: { label: "Registered · paying the fee", className: "status-pending" },
  paid: { label: "Paid · visit confirmed", className: "status-confirmed" },
  confirmed: { label: "Registered · visit confirmed", className: "status-confirmed" },
  cancelled: { label: "Cancelled", className: "status-void" },
  expired: { label: "Link expired", className: "status-void" },
};

/**
 * A doctor books a visit for someone not on MiDokta yet: they're texted a link, and registering books
 * the visit with this doctor (paying the fee first, if there is one). Lists the doctor's invitations.
 */
export default function InvitePatient({ invites, defaultCountry, fee }: { invites: InviteRow[]; defaultCountry: string; fee: string | null }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [country, setCountry] = useState(defaultCountry);
  const { busy, error, setError, submitWith } = useServerAction();
  const list = useServerAction();
  const today = new Date().toLocaleDateString("en-CA");
  const close = () => {
    setOpen(false);
    setSent(false);
    setError(null);
  };

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <i className="fa-solid fa-user-plus btn-icon" /> Invite a new patient
      </button>

      {invites.length > 0 && (
        <section className="card invites-card">
          <h3 className="details-subhead">Invitations you&apos;ve sent</h3>
          {list.error && <p className="form-error">{list.error}</p>}
          <ul className="invite-list">
            {invites.map((i) => (
              <li key={i.id}>
                <span>
                  <strong>{i.name}</strong> <span className="section-sub">· {i.phone}</span>
                  <br />
                  <span className="section-sub">Visit {i.visit}</span>
                </span>
                <span className="invite-list-actions">
                  <span className={`status-pill ${STATUS[i.status].className}`}>{STATUS[i.status].label}</span>
                  {i.status === "waiting" && (
                    <button
                      className="btn btn-sm btn-outline"
                      disabled={list.busy}
                      onClick={() => list.run(() => cancelInvite(i.id), { confirm: `Cancel the invitation to ${i.name}? Their link will stop working.` })}
                    >
                      Cancel
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {open && (
        <Modal title="Invite a new patient" onClose={close}>
          {sent ? (
            <>
              <p className="form-note">
                <i className="fa-solid fa-circle-check" /> Invitation texted. When they register, the visit is booked with you
                {fee ? ` once they've paid your ${fee} fee` : ""}. You&apos;ll be notified.
              </p>
              <div className="modal-actions">
                <button className="btn btn-primary" onClick={close}>
                  Done
                </button>
              </div>
            </>
          ) : (
            <form className="form-grid" onSubmit={submitWith(inviteNewPatient, { onSuccess: () => setSent(true) })}>
              <p className="form-note full">
                For someone who isn&apos;t on MiDokta yet. They get a text with a link to register; registering books this visit with you
                {fee ? ` after they pay your ${fee} fee` : ""}.
              </p>
              <label className="field">
                <span>First name *</span>
                <input name="firstName" maxLength={60} required />
              </label>
              <label className="field">
                <span>Last name *</span>
                <input name="lastName" maxLength={60} required />
              </label>
              <div className="field full">
                <label htmlFor="invite-phone">Phone number *</label>
                <PhoneInput id="invite-phone" name="phone" country={country} onCountryChange={setCountry} required />
              </div>
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
                  <option value="IN_PERSON">In person</option>
                  <option value="VIDEO_CALL">Video call in the app</option>
                </select>
              </label>
              <label className="field full">
                <span>Reason</span>
                <input name="title" maxLength={120} placeholder="e.g. Follow-up for blood pressure" />
              </label>
              {error && <p className="form-error full">{error}</p>}
              <div className="modal-actions full">
                <button type="button" className="btn btn-outline" onClick={close}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? "Sending..." : "Book and text the invitation"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
