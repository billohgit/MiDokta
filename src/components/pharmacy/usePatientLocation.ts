"use client";

import { useCallback, useEffect, useState } from "react";
import { type LatLng, isLatLng } from "@/lib/geo";

/** Remembered in this browser only, so moving between pages doesn't ask again. Never sent to the server. */
const STORAGE_KEY = "midokta.location";
const REMEMBER_MS = 15 * 60_000;

/**
 * The patient's position, for showing how far pharmacies are. Asked for only when they tap a button,
 * or straight away if they've already allowed location access for this site.
 */
export function usePatientLocation() {
  const [location, setLocation] = useState<LatLng | null>(null);
  const [status, setStatus] = useState<"idle" | "locating" | "denied" | "unavailable">("idle");

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return setStatus("unavailable");
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const here = { lat: p.coords.latitude, lng: p.coords.longitude };
        setLocation(here);
        setStatus("idle");
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...here, at: Date.now() }));
        } catch {}
      },
      (e) => setStatus(e.code === e.PERMISSION_DENIED ? "denied" : "unavailable"),
      { timeout: 15_000, maximumAge: REMEMBER_MS },
    );
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (saved && Date.now() - saved.at < REMEMBER_MS && isLatLng(saved)) return setLocation({ lat: saved.lat, lng: saved.lng });
    } catch {}
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((p) => p.state === "granted" && request())
      .catch(() => {});
  }, [request]);

  return { location, status, request };
}
