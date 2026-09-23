"use client";

import type { AppointmentStatus } from "@prisma/client";
import { setAppointmentStatus } from "@/app/actions/appointments";
import useServerAction from "@/components/ui/useServerAction";

type Props = { id: string; status: AppointmentStatus; assignedToMe: boolean };

/** Accept / reject / cancel controls for a single appointment (doctor view). */
export default function AppointmentStatusButtons({ id, status, assignedToMe }: Props) {
  const { busy, error, run } = useServerAction();
  const set = (next: AppointmentStatus, confirm?: string) => run(() => setAppointmentStatus(id, next), { confirm });

  return (
    <div className="status-buttons">
      {status === "PENDING" && (
        <>
          <button className="btn btn-sm btn-success" disabled={busy} onClick={() => set("CONFIRMED")}>
            Accept
          </button>
          {assignedToMe && (
            <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => set("REJECTED", "Reject this request?")}>
              Reject
            </button>
          )}
        </>
      )}
      {status === "CONFIRMED" && assignedToMe && (
        <button className="btn btn-sm btn-outline" disabled={busy} onClick={() => set("CANCELLED", "Cancel this appointment?")}>
          Cancel appointment
        </button>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
