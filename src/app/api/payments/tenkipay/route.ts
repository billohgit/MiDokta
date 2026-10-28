import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { settleCheckout } from "@/lib/payments";

/** TenkiPay rejects replays older than this, and so do we. */
const MAX_AGE_SECONDS = 300;

/**
 * TenkiPay webhook. Register this URL in the TenkiPay merchant dashboard:
 *   https://<your-domain>/api/payments/tenkipay
 * and copy its signing secret (whsec_...) into TENKIPAY_WEBHOOK_SECRET.
 *
 * Each delivery is signed with HMAC-SHA256 over "<unix timestamp>.<raw body>". Even a valid event only
 * tells us which checkout to look at: settleCheckout asks TenkiPay for the real status, and records a
 * payment at most once, so a replayed delivery changes nothing.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.TENKIPAY_WEBHOOK_SECRET;
  // The signature covers the exact bytes sent, so verify before parsing anything.
  const raw = Buffer.from(await req.arrayBuffer());
  const delivery = req.headers.get("x-tenkipay-delivery");
  const timestamp = req.headers.get("x-tenkipay-timestamp") ?? "";
  const signature = req.headers.get("x-tenkipay-signature") ?? "";
  if (!secret || !delivery || !validSignature(secret, timestamp, signature, raw)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let json: { event?: unknown; data?: { object?: { session_id?: unknown } } } | null = null;
  try {
    json = JSON.parse(raw.toString("utf8"));
  } catch {}
  const name = String(req.headers.get("x-tenkipay-event") ?? json?.event ?? "");
  const sessionId = String(json?.data?.object?.session_id ?? "");
  if (!name.startsWith("checkout.") || !sessionId) return NextResponse.json({ ok: true, ignored: true });

  const checkout = await prisma.checkoutSession.findUnique({ where: { sessionId } });
  if (!checkout || checkout.channel !== "TENKIPAY") return NextResponse.json({ ok: true, ignored: true });

  try {
    await settleCheckout(checkout);
  } catch (e) {
    console.error(`TenkiPay webhook ${delivery}: settling failed`, e);
    // A 5xx makes TenkiPay retry later.
    return NextResponse.json({ error: "Settling failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}

function validSignature(secret: string, timestamp: string, signature: string, raw: Buffer): boolean {
  const seconds = Number(timestamp);
  if (!/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - seconds) > MAX_AGE_SECONDS) return false;
  const match = /^v1=([a-f0-9]{64})$/.exec(signature);
  if (!match) return false;
  const expected = createHmac("sha256", secret).update(Buffer.concat([Buffer.from(`${timestamp}.`, "utf8"), raw])).digest();
  return timingSafeEqual(Buffer.from(match[1], "hex"), expected);
}
