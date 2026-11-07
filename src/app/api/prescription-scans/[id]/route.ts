import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { maySeeScan, readScanImage } from "@/lib/prescription-reader";

/** A prescription photo, for whoever took it, an admin, or the pharmacy filling an order made from it. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await authorize();
  if (!me) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!(await maySeeScan(me, id))) return new NextResponse("Not found", { status: 404 });
  const scan = await prisma.prescriptionScan.findUniqueOrThrow({ where: { id }, select: { imageRef: true } });
  const image = await readScanImage(scan.imageRef);
  if (!image) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(image.data), {
    headers: { "Content-Type": image.contentType, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" },
  });
}
