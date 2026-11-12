import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { authorize } from "@/lib/auth";
import { isLatLng } from "@/lib/geo";
import { screenPatient } from "@/lib/malaria/cases";
import { DANGER_SIGNS, FOR_WHOM, type ForWhom, SYMPTOMS } from "@/lib/malaria/screening";

// POST /api/malaria/screen — the answers to Omega's malaria check. The server scores them again.
// Body: { answers: {[symptomId]: boolean}, dangerSigns: string[], forWhom, district?, location? }
export async function POST(req: Request) {
  const patient = await authorize(Role.PATIENT);
  if (!patient) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const raw = body?.answers as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== "object" || !SYMPTOMS.every((q) => typeof raw[q.id] === "boolean")) {
    return NextResponse.json({ error: "Please answer every question." }, { status: 400 });
  }
  const answers = Object.fromEntries(SYMPTOMS.map((q) => [q.id, raw[q.id] as boolean]));
  const dangerSigns = Array.isArray(body?.dangerSigns) ? DANGER_SIGNS.map((d) => d.id).filter((id) => (body.dangerSigns as unknown[]).includes(id)) : [];
  const forWhom = FOR_WHOM.find((f) => f.id === body?.forWhom)?.id ?? ("SELF" as ForWhom);
  const district = typeof body?.district === "string" && body.district.trim() ? body.district.trim().slice(0, 60) : null;

  try {
    const result = await screenPatient(patient, { answers, dangerSigns, forWhom, district, location: isLatLng(body?.location) ? body.location : null });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("Malaria check:", e);
    return NextResponse.json({ error: "The malaria check couldn't be saved. Please try again." }, { status: 500 });
  }
}
