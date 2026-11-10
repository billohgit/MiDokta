"use client";

import { type LatLng, directionsUrl, distanceKm, formatDistance } from "@/lib/geo";
import { usePatientLocation } from "./usePatientLocation";

/**
 * How far a pharmacy is from the patient, with directions. For pages that show one pharmacy (the
 * cart, an order); the shop computes distances for its whole list itself.
 */
export default function PharmacyDistance({ to }: { to: LatLng | null }) {
  const { location, status, request } = usePatientLocation();
  if (!to) return null;
  return (
    <span className="pharmacy-distance">
      <i className="fa-solid fa-location-dot" />{" "}
      {location ? (
        <>{formatDistance(distanceKm(location, to))} from you</>
      ) : (
        <button type="button" className="link-btn" onClick={request} disabled={status === "locating"}>
          {status === "locating" ? "Finding you..." : status === "denied" ? "Location blocked" : "How far is it?"}
        </button>
      )}{" "}
      ·{" "}
      <a href={directionsUrl(location, to)} target="_blank" rel="noreferrer" className="link-btn">
        Directions
      </a>
    </span>
  );
}
