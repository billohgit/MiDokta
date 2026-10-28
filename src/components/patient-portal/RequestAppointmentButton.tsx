"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MobileWallet } from "@prisma/client";
import { requestAppointment } from "@/app/actions/patient-portal";
import Modal from "@/components/ui/Modal";
import useServerAction from "@/components/ui/useServerAction";

/** `fee` is formatted, or null when booking the doctor is free. */
type Doctor = { id: string; name: string; specialty: string | null; fee: string | null };

const REFUND_WALLETS: { value: MobileWallet; label: string }[] = [
  { value: "ORANGE_MONEY", label: "Orange Money" },
  { value: "AFRIMONEY", label: "Afrimoney" },
  { value: "QMONEY", label: "QMoney" },
  { value: "TENKIPAY", label: "TenkiPay wallet" },
];

/**
 * "Request an appointment" button and form. The clinic or the doctor confirms the time. For a doctor
 * who charges a fee, the patient pays it first (we take them to the invoice), and says where a refund
 * should go if the visit is declined or cancelled.
 */
export default function RequestAppointmentButton({ doctors, phone }: { doctors: Doctor[]; phone: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [doctorId, setDoctorId] = useState("");
  const [wallet, setWallet] = useState<MobileWallet>("ORANGE_MONEY");
  const { busy, error, setError, submitWith } = useServerAction();
  const today = new Date().toLocaleDateString("en-CA");
  const fee = doctors.find((d) => d.id === doctorId)?.fee ?? null;

  const close = () => {
    setOpen(false);
    setDone(false);
    setDoctorId("");
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
            <form
              className="form-grid"
              onSubmit={submitWith(requestAppointment, {
                onSuccess: (r) => {
                  const payInvoiceId = (r as { payInvoiceId?: string }).payInvoiceId;
                  if (payInvoiceId) router.push(`/patient/billing/${payInvoiceId}`);
                  else setDone(true);
                },
              })}
            >
              <label className="field full">
                <span>Doctor *</span>
                <select name="doctorId" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} required>
                  <option value="" disabled>
                    Choose a doctor
                  </option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                      {d.specialty ? ` · ${d.specialty}` : ""}
                      {d.fee ? ` · ${d.fee}` : ""}
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
              {fee && (
                <>
                  <p className="form-note full">
                    <i className="fa-solid fa-circle-info" /> The consultation fee is <strong>{fee}</strong>, paid now. Your request reaches
                    the doctor once it&apos;s paid. If the doctor declines or the visit is cancelled, you get the whole fee back.
                  </p>
                  <label className="field">
                    <span>Refund to *</span>
                    <select name="refundWallet" value={wallet} onChange={(e) => setWallet(e.target.value as MobileWallet)}>
                      {REFUND_WALLETS.map((w) => (
                        <option key={w.value} value={w.value}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>{wallet === "TENKIPAY" ? "Wallet number *" : "Mobile number *"}</span>
                    <input name="refundAccount" defaultValue={phone ?? ""} required inputMode={wallet === "TENKIPAY" ? "text" : "tel"} />
                  </label>
                </>
              )}
              {error && <p className="form-error full">{error}</p>}
              <div className="modal-actions full">
                <button type="button" className="btn btn-outline" onClick={close}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? "Sending..." : fee ? `Continue to pay ${fee}` : "Send request"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
