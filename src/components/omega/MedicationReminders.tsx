"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DOSE_TIMES, SLOT_ORDER, type DoseSlot } from "@/lib/medication-schedule";
import type { MedicationPlan } from "@/lib/omega/medications";
import { playChime } from "@/components/calls/sounds";
import { speak, spokenDose, voiceEnabled } from "./speech";

/**
 * Spoken medication reminders while the patient portal is open: at each dose time of the day
 * (morning, midday, evening, night) Omega chimes and says which medicines to take, until the
 * patient taps "I've taken it". In a background tab it also shows a system notification.
 */

const CHECK_MS = 30_000;
const REFRESH_MS = 30 * 60_000;
/** A dose is still announced if the portal is opened up to this long after its time. */
const WINDOW_MS = 2 * 60 * 60_000;
const SNOOZE_MS = 10 * 60_000;

type Due = { key: string; slot: DoseSlot; meds: MedicationPlan[] };

// Per-dose state, shared between tabs: "announced", "taken" or "snooze:<until ms>".
const storageKey = (now: Date, slot: DoseSlot) =>
  `omega:dose:${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}:${slot}`;

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Without storage, reminders still work for this page.
  }
}

const slotTime = (now: Date, slot: DoseSlot) => {
  const t = new Date(now);
  t.setHours(DOSE_TIMES[slot].hour, DOSE_TIMES[slot].minute, 0, 0);
  return t;
};

/** The dose that needs the patient's attention now, if any. */
function findDue(plans: MedicationPlan[], now: Date): (Due & { speak: boolean }) | null {
  for (const slot of SLOT_ORDER) {
    const at = slotTime(now, slot);
    if (now < at || now.getTime() - at.getTime() > WINDOW_MS) continue;
    const meds = plans.filter(
      (p) => p.slots.includes(slot) && new Date(p.startedOn) <= at && (!p.endsOn || new Date(p.endsOn) > at)
    );
    if (!meds.length) continue;

    const key = storageKey(now, slot);
    const status = read(key);
    if (status === "taken") continue;
    if (status?.startsWith("snooze:") && now.getTime() < Number(status.slice("snooze:".length))) continue;
    // Announce aloud the first time (and after a snooze); after a reload, just show it again.
    return { key, slot, meds, speak: status !== "announced" };
  }
  return null;
}

export function reminderText(slot: DoseSlot, meds: MedicationPlan[], firstName: string) {
  const list = meds.map((m) => `${m.medication}, ${m.dosage}${m.instructions ? `. ${m.instructions}` : ""}`).join(". ");
  const opener = slot === "midday" ? "It's midday" : slot === "night" ? "It's night time" : `It's ${slot}`;
  return `${opener}, ${firstName}. Time to take your medicine: ${list}.`;
}

export default function MedicationReminders({ firstName }: { firstName: string }) {
  const [plans, setPlans] = useState<MedicationPlan[]>([]);
  const [due, setDue] = useState<Due | null>(null);
  const dueKey = useRef<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/omega/medications", { cache: "no-store" });
        if (res.ok) setPlans((await res.json()).medications);
      } catch {
        // Try again next refresh.
      }
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  const announce = useCallback(
    (d: Due) => {
      const text = reminderText(d.slot, d.meds, firstName);
      if (document.hidden && "Notification" in window && Notification.permission === "granted") {
        new Notification(`Time for your ${DOSE_TIMES[d.slot].label} medicine`, { body: text, tag: d.key, icon: "/omega.png" });
      }
      playChime();
      if (voiceEnabled()) setTimeout(() => speak(spokenDose(text)), 700);
    },
    [firstName]
  );

  useEffect(() => {
    if (!plans.length) return;
    const check = () => {
      const found = findDue(plans, new Date());
      if (!found) {
        if (dueKey.current && read(dueKey.current) !== "announced") {
          // Taken or snoozed in another tab.
          dueKey.current = null;
          setDue(null);
        }
        return;
      }
      if (found.key === dueKey.current && !found.speak) return;
      write(found.key, "announced");
      dueKey.current = found.key;
      setDue(found);
      if (found.speak) announce(found);
    };
    check();
    const timer = setInterval(check, CHECK_MS);
    return () => clearInterval(timer);
  }, [plans, announce]);

  if (!due) return null;

  const close = (status: string) => {
    write(due.key, status);
    dueKey.current = null;
    setDue(null);
  };

  return (
    <div className="omega-reminder" role="alertdialog" aria-labelledby="omega-reminder-title">
      <img src="/omega.png" alt="" className="omega-reminder-avatar" />
      <div className="omega-reminder-body">
        <strong id="omega-reminder-title">
          <i className="fa-solid fa-pills" /> Time for your {DOSE_TIMES[due.slot].label} medicine
        </strong>
        <ul>
          {due.meds.map((m) => (
            <li key={m.id}>
              {m.medication} <span>· {m.dosage}</span>
              {m.instructions && <small>{m.instructions}</small>}
            </li>
          ))}
        </ul>
        <div className="omega-reminder-actions">
          <button className="btn btn-primary btn-sm" onClick={() => close("taken")}>
            <i className="fa-solid fa-check btn-icon" /> I&apos;ve taken it
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => close(`snooze:${Date.now() + SNOOZE_MS}`)}>
            Remind me in 10 min
          </button>
          <button className="icon-btn" aria-label="Hear again" title="Hear again" onClick={() => speak(spokenDose(reminderText(due.slot, due.meds, firstName)))}>
            <i className="fa-solid fa-volume-high" />
          </button>
        </div>
      </div>
    </div>
  );
}
