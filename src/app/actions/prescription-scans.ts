"use server";

import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/auth";
import {
  DAILY_SCANS,
  MAX_SCAN_BYTES,
  SCAN_IMAGE_TYPES,
  describeReaderError,
  matchProducts,
  readPrescription,
  saveScanImage,
  type PrescriptionReading,
  type ProductMatch,
} from "@/lib/prescription-reader";

const fail = (error: string) => ({ ok: false as const, error });
const DENIED = fail("You are not allowed to do that.");

export type ScanResult =
  | { ok: true; scanId: string; reading: PrescriptionReading; matches: ProductMatch[][] }
  | { ok: false; error: string };

/**
 * Reads a prescription photo. Patients get matches from every pharmacy's stock; pharmacists from
 * their own shelf. The photo is kept (privately) only when the reading worked.
 */
export async function scanPrescription(formData: FormData): Promise<ScanResult> {
  const me = await authorize(Role.PATIENT, Role.PHARMACIST);
  if (!me) return DENIED;

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return fail("Take or choose a photo of the prescription.");
  const type = SCAN_IMAGE_TYPES.find((t) => t === file.type);
  if (!type) return fail("Use a JPG, PNG or WebP photo.");
  if (file.size > MAX_SCAN_BYTES) return fail("The photo must be 5 MB or smaller.");

  const today = await prisma.prescriptionScan.count({ where: { userId: me.id, createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } } });
  if (today >= DAILY_SCANS) return fail(`You can scan up to ${DAILY_SCANS} prescriptions a day. Please try again tomorrow.`);

  let reading: PrescriptionReading;
  try {
    reading = await readPrescription(Buffer.from(await file.arrayBuffer()), type);
  } catch (e) {
    console.error("Prescription reading failed", e);
    return fail(describeReaderError(e));
  }
  if (!reading.is_prescription) return fail("That doesn't look like a prescription. Take a clear photo of the whole prescription.");

  const scan = await prisma.prescriptionScan.create({ data: { userId: me.id, imageRef: await saveScanImage(me.id, file), result: reading } });
  const pharmacy = me.role === Role.PHARMACIST ? await prisma.pharmacy.findUnique({ where: { ownerId: me.id }, select: { id: true } }) : null;
  const matches =
    me.role === Role.PHARMACIST && !pharmacy ? reading.medicines.map(() => []) : await matchProducts(reading.medicines, pharmacy?.id);
  return { ok: true, scanId: scan.id, reading, matches };
}
