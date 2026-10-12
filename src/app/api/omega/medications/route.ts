import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { authorize } from "@/lib/auth";
import { activeMedications } from "@/lib/omega/medications";

// GET /api/omega/medications — the signed-in patient's current medicines and dose times, for spoken reminders.
export async function GET() {
  const patient = await authorize(Role.PATIENT);
  if (!patient) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ medications: await activeMedications(patient.id) }, { headers: { "Cache-Control": "no-store" } });
}
