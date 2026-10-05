import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { settleCheckout } from "@/lib/payments";

/**
 * Monime webhook. Configure it in the Monime dashboard to POST to:
 *   https://<your-domain>/api/payments/monime?token=<MONIME_WEBHOOK_SECRET>
 *
 * The body only tells us which checkout to look at: settleCheckout asks Monime for the real status,
 * so a forged or replayed event can't mark anything paid.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.MONIME_WEBHOOK_SECRET;
  const token = Buffer.from(req.nextUrl.searchParams.get("token") ?? "");
  if (!secret || token.length !== Buffer.byteLength(secret) || !timingSafeEqual(token, Buffer.from(secret))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const name = String(json?.event?.name ?? "");
  const sessionId = String(json?.object?.id ?? json?.data?.id ?? "");
  if (!name.startsWith("checkout_session.") || !sessionId) return NextResponse.json({ ok: true, ignored: true });

  const checkout = await prisma.checkoutSession.findUnique({ where: { sessionId } });
  if (!checkout) return NextResponse.json({ ok: true, ignored: true });

  try {
    await settleCheckout(checkout);
  } catch (e) {
    console.error("Monime webhook: settling failed", e);
    // A 5xx makes Monime retry later.
    return NextResponse.json({ error: "Settling failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
