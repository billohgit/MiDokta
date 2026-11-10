/** Map positions and distances, shared by the server and the browser. */

export type LatLng = { lat: number; lng: number };

export const isLatLng = (v: unknown): v is LatLng =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as LatLng).lat === "number" &&
  typeof (v as LatLng).lng === "number" &&
  Math.abs((v as LatLng).lat) <= 90 &&
  Math.abs((v as LatLng).lng) <= 180;

/** Straight-line distance in km; the road route is usually longer. */
export function distanceKm(a: LatLng, b: LatLng) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** "350 m", "2.4 km", "38 km". */
export function formatDistance(km: number) {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

/** Opens turn-by-turn directions in Google Maps (the app on phones). With no `from`, the phone uses where it is. */
export const directionsUrl = (from: LatLng | null, to: LatLng) =>
  `https://www.google.com/maps/dir/?api=1${from ? `&origin=${from.lat},${from.lng}` : ""}&destination=${to.lat},${to.lng}&travelmode=driving`;
