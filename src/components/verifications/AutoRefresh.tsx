"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const POLL_MS = 5_000;

/** Re-fetches the page every few seconds while `active`, so finished checks show up on their own. */
export default function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [active, router]);

  return null;
}
