"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteDoctor, setDoctorActive } from "@/app/actions/doctors";

type Doctor = { id: string; firstName: string; lastName: string; isActive: boolean };

export default function useDoctorActions() {
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const toggleActive = (d: Doctor) => {
    if (d.isActive && !confirm(`Deactivate Dr. ${d.firstName} ${d.lastName}? They will no longer be able to sign in.`)) {
      return;
    }
    startTransition(async () => {
      const result = await setDoctorActive(d.id, !d.isActive);
      setError(result.ok ? null : result.error);
    });
  };

  /** Deletes the doctor; `redirectTo` is where to go afterwards (e.g. from the detail page). */
  const remove = (d: Doctor, redirectTo?: string) => {
    if (!confirm(`Delete Dr. ${d.firstName} ${d.lastName}? This cannot be undone.`)) return;
    startTransition(async () => {
      const result = await deleteDoctor(d.id);
      setError(result.ok ? null : result.error);
      if (result.ok && redirectTo) router.push(redirectTo);
    });
  };

  return { busy, error, toggleActive, remove };
}
