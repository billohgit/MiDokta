import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { authorize } from "@/lib/auth";
import { aiUnavailable, askOmega, type OmegaTurn } from "@/lib/omega/agent";
import { answerWithoutAI } from "@/lib/omega/fallback";
import { isLatLng } from "@/lib/omega/hospitals";
import { isOmegaLanguage } from "@/lib/omega/types";

const MAX_TURNS = 12;
const MAX_TEXT = 2000;

const isTurn = (t: unknown): t is OmegaTurn =>
  typeof t === "object" &&
  t !== null &&
  ((t as OmegaTurn).role === "user" || (t as OmegaTurn).role === "assistant") &&
  typeof (t as OmegaTurn).text === "string" &&
  (t as OmegaTurn).text.trim().length > 0;

const FAILED = {
  en: "Omega couldn't answer just now. Please try again.",
  fr: "Omega n'a pas pu répondre. Réessayez, s'il vous plaît.",
  kri: "Omega nɔ ebul ansa naw. Tray bak.",
};

// POST /api/omega — one turn with Omega, the patient's AI assistant.
// Body: { messages: {role, text}[], location?: {lat, lng}, localTime: string, today?: "YYYY-MM-DD", language?: "en" | "kri" | "fr" }
// When the AI can't be reached, Omega answers in basic mode (src/lib/omega/fallback.ts).
export async function POST(req: Request) {
  const patient = await authorize(Role.PATIENT);
  if (!patient) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { messages?: unknown; location?: unknown; localTime?: unknown; today?: unknown; language?: unknown } | null;
  if (!body || !Array.isArray(body.messages) || !body.messages.every(isTurn)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Only the recent conversation, starting with something the patient said.
  const history = body.messages.slice(-MAX_TURNS).map((t) => ({ role: t.role, text: t.text.trim().slice(0, MAX_TEXT) }));
  while (history.length && history[0].role !== "user") history.shift();
  if (history.at(-1)?.role !== "user") return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const language = isOmegaLanguage(body.language) ? body.language : "en";
  const location = isLatLng(body.location) ? body.location : null;
  const today = typeof body.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : new Date().toISOString().slice(0, 10);
  const headers = { "Cache-Control": "no-store" };

  try {
    const reply = await askOmega(history, {
      patient,
      location,
      localTime: typeof body.localTime === "string" ? body.localTime.slice(0, 80) : new Date().toUTCString(),
      today,
      language,
    });
    return NextResponse.json(reply, { headers });
  } catch (e) {
    if (!aiUnavailable(e)) {
      console.error("Omega:", e);
      return NextResponse.json({ error: FAILED[language] }, { status: 502 });
    }
    console.warn("Omega: AI unavailable, answering in basic mode:", e instanceof Error ? e.message.slice(0, 200) : e);
    try {
      return NextResponse.json(await answerWithoutAI(history.at(-1)!.text, { patient, location, language }), { headers });
    } catch (fallbackError) {
      console.error("Omega basic mode:", fallbackError);
      return NextResponse.json({ error: FAILED[language] }, { status: 502 });
    }
  }
}
