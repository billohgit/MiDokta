import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Finds the hospitals closest to a patient: the hospitals on Mi Dokta that have a map position,
 * plus public hospitals and clinics from OpenStreetMap, so patients are directed somewhere even
 * where Mi Dokta has no partner hospital yet.
 *
 * OpenStreetMap is searched through Nominatim (fast) and, when that fails, Overpass (thorough but
 * often overloaded). Both are free public services with fair-use limits, so results are cached.
 */

export type LatLng = { lat: number; lng: number };

export type NearbyHospital = {
  name: string;
  kind: "hospital" | "clinic";
  lat: number;
  lng: number;
  /** Straight-line distance; the road route is usually longer. */
  distanceKm: number;
  address: string | null;
  phone: string | null;
  /** Known to have an emergency department (OpenStreetMap emergency=yes). */
  emergency: boolean;
  /** A Mi Dokta hospital, where the patient's records and doctors are. */
  onMiDokta: boolean;
  directionsUrl: string;
};

type Place = Omit<NearbyHospital, "distanceKm" | "directionsUrl">;

const SEARCH_RADIUS_KM = 25;
const MAX_RESULTS = 6;
const CACHE_MS = 30 * 60_000;
const USER_AGENT = "MiDokta/1.0 (patient hospital finder)";
const NOMINATIM_URL = process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org/search";
const OVERPASS_URL = process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";

export const isLatLng = (v: unknown): v is LatLng =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as LatLng).lat === "number" &&
  typeof (v as LatLng).lng === "number" &&
  Math.abs((v as LatLng).lat) <= 90 &&
  Math.abs((v as LatLng).lng) <= 180;

function distanceKm(a: LatLng, b: LatLng) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Opens turn-by-turn directions in Google Maps (the app on phones). */
export const directionsUrl = (from: LatLng, to: LatLng) =>
  `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=driving`;

// Dentists are tagged as clinics too, but are no help to someone looking for a doctor.
const isDentist = (name: string, tags: Record<string, string | undefined>) =>
  tags.healthcare === "dentist" || /dentist|dental/i.test(`${name} ${tags["healthcare:speciality"] ?? ""}`);

type NominatimResult = {
  name: string;
  lat: string;
  lon: string;
  type: string;
  extratags?: Record<string, string> | null;
  address?: Record<string, string>;
};

/** One amenity type within a box `spanDeg` degrees either side of the patient. Nominatim returns at most 40. */
async function nominatim(at: LatLng, amenity: "hospital" | "clinic", spanDeg: number): Promise<Place[]> {
  const params = new URLSearchParams({
    format: "jsonv2",
    amenity,
    viewbox: [at.lng - spanDeg, at.lat + spanDeg, at.lng + spanDeg, at.lat - spanDeg].join(","),
    bounded: "1",
    limit: "40",
    extratags: "1",
    addressdetails: "1",
  });
  const res = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Nominatim answered ${res.status}`);
  const results = (await res.json()) as NominatimResult[];
  return results.flatMap((r) => {
    const tags = r.extratags ?? {};
    if (!r.name || isDentist(r.name, tags)) return [];
    const a = r.address ?? {};
    const street = [a.house_number, a.road].filter(Boolean).join(" ");
    return [
      {
        name: r.name,
        kind: amenity,
        lat: Number(r.lat),
        lng: Number(r.lon),
        address: [street, a.suburb ?? a.city_district, a.city ?? a.town ?? a.village].filter(Boolean).join(", ") || null,
        phone: tags.phone ?? tags["contact:phone"] ?? null,
        emergency: tags.emergency === "yes",
        onMiDokta: false,
      },
    ];
  });
}

async function searchNominatim(at: LatLng, includeClinics: boolean): Promise<Place[]> {
  // Start with the city around the patient (about 11 km); widen when that finds too few hospitals.
  // Requests are sequential: Nominatim's usage policy allows one at a time.
  let hospitals = await nominatim(at, "hospital", 0.1);
  if (hospitals.length < 3) hospitals = await nominatim(at, "hospital", 0.25);
  const clinics = includeClinics ? await nominatim(at, "clinic", 0.1) : [];
  return [...hospitals, ...clinics];
}

type OverpassElement = { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

async function searchOverpass(at: LatLng, includeClinics: boolean): Promise<Place[]> {
  const amenity = includeClinics ? "^(hospital|clinic)$" : "^hospital$";
  const query = `[out:json][timeout:10];nwr["amenity"~"${amenity}"](around:${SEARCH_RADIUS_KM * 1000},${at.lat},${at.lng});out center tags 80;`;
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Overpass answered ${res.status}`);
  const { elements } = (await res.json()) as { elements: OverpassElement[] };

  return elements.flatMap((el) => {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    const tags = el.tags ?? {};
    const name = tags.name ?? tags["name:en"];
    if (lat === undefined || lng === undefined || !name || isDentist(name, tags)) return [];
    const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
    return [
      {
        name,
        kind: tags.amenity === "clinic" ? ("clinic" as const) : ("hospital" as const),
        lat,
        lng,
        address: [street, tags["addr:city"]].filter(Boolean).join(", ") || null,
        phone: tags.phone ?? tags["contact:phone"] ?? null,
        emergency: tags.emergency === "yes",
        onMiDokta: false,
      },
    ];
  });
}

// Recent searches, keyed by rounded position (about 1 km), so repeat questions answer instantly.
const cache = new Map<string, { at: number; places: Place[] }>();

async function openStreetMapHospitals(at: LatLng, includeClinics: boolean): Promise<Place[]> {
  const key = `${at.lat.toFixed(2)},${at.lng.toFixed(2)},${includeClinics}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.places;

  let places: Place[];
  try {
    places = await searchNominatim(at, includeClinics);
  } catch (e) {
    console.error("Hospital search (Nominatim):", e);
    places = await searchOverpass(at, includeClinics);
  }
  cache.set(key, { at: Date.now(), places });
  return places;
}

/**
 * The closest hospitals, nearest first. `error` is set when the public map search failed, in which
 * case only Mi Dokta hospitals are returned.
 */
export async function nearestHospitals(at: LatLng, includeClinics: boolean): Promise<{ hospitals: NearbyHospital[]; error?: string }> {
  const [ours, publicResult] = await Promise.all([
    prisma.hospital.findMany({ where: { isActive: true, latitude: { not: null }, longitude: { not: null } } }),
    openStreetMapHospitals(at, includeClinics).then(
      (list): { list: Place[]; error?: string } => ({ list }),
      (e: unknown) => {
        console.error("Hospital search:", e);
        return { list: [], error: "The public map search is unavailable right now." };
      }
    ),
  ]);

  const candidates: Place[] = [
    ...ours.map((h) => ({
      name: h.name,
      kind: "hospital" as const,
      lat: h.latitude!,
      lng: h.longitude!,
      address: [h.address, h.city].filter(Boolean).join(", ") || null,
      phone: h.phone,
      emergency: false,
      onMiDokta: true,
    })),
    ...publicResult.list,
  ];

  // The same hospital can be on Mi Dokta and on the map: keep the first (Mi Dokta) entry.
  const kept: Place[] = [];
  for (const c of candidates) {
    const name = c.name.toLowerCase();
    const duplicate = kept.some(
      (k) => distanceKm(k, c) < 0.3 && (k.name.toLowerCase().includes(name) || name.includes(k.name.toLowerCase()))
    );
    if (!duplicate) kept.push(c);
  }

  const hospitals = kept
    .map((h) => ({ ...h, distanceKm: Math.round(distanceKm(at, h) * 10) / 10, directionsUrl: directionsUrl(at, h) }))
    .filter((h) => h.onMiDokta || h.distanceKm <= SEARCH_RADIUS_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, MAX_RESULTS);

  return { hospitals, error: publicResult.error };
}
