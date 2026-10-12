import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { authorize } from "@/lib/auth";
import { askOmega, describeOmegaError, type OmegaTurn } from "@/lib/omega/agent";
import { isLatLng } from "@/lib/omega/hospitals";

const MAX_TURNS = 12;
const MAX_TEXT = 2000;

const isTurn = (t: unknown): t is OmegaTurn =>
  typeof t === "object" &&
  t !== null &&
  ((t as OmegaTurn).role === "user" || (t as OmegaTurn).role === "assistant") &&
  typeof (t as OmegaTurn).text === "string" &&
  (t as OmegaTurn).text.trim().length > 0;

// POST /api/omega — one turn with Omega, the patient's AI assistant.
// Body: { messages: {role, text}[], location?: {lat, lng}, localTime: string }
export async function POST(req: Request) {
  const patient = await authorize(Role.PATIENT);
  if (!patient) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { messages?: unknown; location?: unknown; localTime?: unknown } | null;
  if (!body || !Array.isArray(body.messages) || !body.messages.every(isTurn)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Only the recent conversation, starting with something the patient said.
  const history = body.messages.slice(-MAX_TURNS).map((t) => ({ role: t.role, text: t.text.trim().slice(0, MAX_TEXT) }));
  while (history.length && history[0].role !== "user") history.shift();
  if (history.at(-1)?.role !== "user") return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  try {
    const reply = await askOmega(history, {
      patient,
      location: isLatLng(body.location) ? body.location : null,
      localTime: typeof body.localTime === "string" ? body.localTime.slice(0, 80) : new Date().toUTCString(),
    });
    return NextResponse.json(reply, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("Omega:", e);
    return NextResponse.json({ error: describeOmegaError(e) }, { status: 502 });
  }
}
