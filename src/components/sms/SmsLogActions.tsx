"use client";

import { useState, useTransition } from "react";
import { retrySms, runScheduledSmsNow } from "@/app/actions/sms";

type Props = { mode: "retry"; id: string } | { mode: "run-scheduled" };

export default function SmsLogActions(props: Props) {
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (props.mode === "retry") {
    return (
      <span className="sms-action">
        <button
          className="btn btn-sm btn-outline"
          disabled={busy}
          onClick={() =>
            startTransition(async () => {
              const r = await retrySms(props.id);
              setMessage(r.ok ? null : { ok: false, text: r.error });
            })
          }
        >
          {busy ? "Retrying..." : "Retry"}
        </button>
        {message && <small className="sms-error">{message.text}</small>}
      </span>
    );
  }

  return (
    <span className="sms-action align-end">
      <button
        className="btn btn-outline btn-sm"
        disabled={busy}
        title="Sends due appointment reminders, follow-up reminders and doctors' daily schedules"
        onClick={() =>
          startTransition(async () => {
            const r = await runScheduledSmsNow();
            if (!r.ok) return setMessage({ ok: false, text: r.error });
            const s = r.summary!;
            setMessage({
              ok: true,
              text: `Queued ${s.appointmentReminders} appointment reminders, ${s.followUpReminders} follow-up reminders, ${s.dailySchedules} daily schedules (${s.skipped} skipped).`,
            });
          })
        }
      >
        <i className="fa-solid fa-clock-rotate-left btn-icon" />
        {busy ? "Running..." : "Run scheduled reminders now"}
      </button>
      {message && <small className={message.ok ? "sms-ok" : "sms-error"}>{message.text}</small>}
    </span>
  );
}
