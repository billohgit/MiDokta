"use client";

import { cancelMyAppointment } from "@/app/actions/patient-portal";
import useServerAction from "@/components/ui/useServerAction";

export default function CancelAppointmentButton({ id, when }: { id: string; when: string }) {
  const { busy, error, run } = useServerAction();

  return (
    <>
      <button
        type="button"
        className="btn btn-sm btn-outline"
        disabled={busy}
        onClick={() => run(() => cancelMyAppointment(id), { confirm: `Cancel your appointment on ${when}?` })}
      >
        {busy ? "Cancelling..." : "Cancel"}
      </button>
      {error && <small className="form-error">{error}</small>}
    </>
  );
}
