import "server-only";

import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import { randomBytes } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { get, put } from "@vercel/blob";
import { Role, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { UPLOAD_ROOT } from "@/lib/uploads";

/**
 * Reads a photo of a prescription (often handwritten) with Claude and lists the medicines on it, then
 * finds matching products in the pharmacy shop. Handwriting is hard and a misread drug or dose can
 * hurt someone, so the reading is only ever a suggestion: every line carries a confidence, unclear
 * words are flagged rather than guessed, and a person checks it against the photo (the patient when
 * ordering, the pharmacist before sending the order).
 */

const MODEL = "claude-opus-5-5";
/** Scans a person may run per day; each one is a paid model call. */
export const DAILY_SCANS = 10;
export const SCAN_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_SCAN_BYTES = 5 * 1024 * 1024;

export type Confidence = "high" | "medium" | "low";

export type ReadMedicine = {
  name: string;
  strength: string;
  form: string;
  dose: string;
  frequency: string;
  duration: string;
  quantity: string;
  confidence: Confidence;
  note: string;
};

export type PrescriptionReading = {
  is_prescription: boolean;
  legible: boolean;
  prescriber: string;
  date: string;
  medicines: ReadMedicine[];
  warnings: string[];
};

const text = { type: "string" } as const;
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_prescription", "legible", "prescriber", "date", "medicines", "warnings"],
  properties: {
    is_prescription: { type: "boolean" },
    legible: { type: "boolean" },
    prescriber: text,
    date: text,
    medicines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "strength", "form", "dose", "frequency", "duration", "quantity", "confidence", "note"],
        properties: {
          name: text,
          strength: text,
          form: text,
          dose: text,
          frequency: text,
          duration: text,
          quantity: text,
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          note: text,
        },
      },
    },
    warnings: { type: "array", items: text },
  },
} as const;

const SYSTEM = `You read photos of medical prescriptions for a clinic in Sierra Leone, many of them handwritten by doctors. Pharmacists and patients use your reading to find the medicines, and a pharmacist checks it against the photo before anything is dispensed.

Transcribe what is written. Never add a medicine that is not on the prescription, and never invent a strength, dose or duration that you cannot read: leave that field as an empty string.

For each medicine:
- name: the medicine as written (brand or generic). If you are sure of a well-known generic for a brand name, mention it in note.
- strength (e.g. "500mg"), form (tablet, capsule, syrup, injection, cream...), dose (e.g. "1 tablet", "5 ml").
- frequency in plain English, expanding prescription abbreviations: OD/daily = once a day, BD/BID = twice a day, TDS/TID = three times a day, QDS/QID = four times a day, nocte = at night, mane = in the morning, PRN = when needed, stat = once immediately, PO = by mouth, ac/pc = before/after food.
- duration (e.g. "5 days") and quantity to dispense, if written.
- confidence: "high" only when the name and strength are clearly legible; "medium" when you are fairly sure but some letters are unclear; "low" when you are guessing between possibilities. Say in note what was unclear and, if relevant, the other possible reading.

Set legible to false when most of the prescription can't be read. Set is_prescription to false if the image is not a prescription (and return no medicines). In warnings, list anything a pharmacist should double-check: an unusual or very high dose, a missing strength, two medicines that look like duplicates, an unreadable line, or an apparent date long in the past.`;

let client: Anthropic | null = null;

/** Reads the medicines on a prescription photo. Throws if the AI can't be reached. */
export async function readPrescription(image: Buffer, mediaType: (typeof SCAN_IMAGE_TYPES)[number]): Promise<PrescriptionReading> {
  client ??= new Anthropic();
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 8000,
    // If the model declines, the API retries on Anthropic's recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    // Reading handwriting carefully is worth the extra thinking.
    output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: image.toString("base64") } },
          { type: "text", text: "Read this prescription." },
        ],
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error("The AI declined to read this image.");
  const json = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return JSON.parse(json) as PrescriptionReading;
}

/** A message for the person scanning when the AI couldn't run. */
export function describeReaderError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "Prescription reading isn't set up yet.";
  if (e instanceof Anthropic.BadRequestError && /credit balance/i.test(e.message)) return "Prescription reading isn't set up yet.";
  if (e instanceof Anthropic.RateLimitError) return "Prescription reading is busy right now. Please try again in a minute.";
  if (!(e instanceof Anthropic.APIError) && e instanceof Error && /api key|apiKey|authentication/i.test(e.message)) {
    return "Prescription reading isn't set up yet.";
  }
  return "The prescription couldn't be read just now. Please try again.";
}

// ---- The photo ------------------------------------------------------------------------------------

const privateToken = () => process.env.BLOB_PRIVATE_READ_WRITE_TOKEN;
const LOCAL_DIR = path.join(UPLOAD_ROOT, "prescription-scans");
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Keeps the photo privately (it's health information) and returns its reference. */
export async function saveScanImage(userId: string, file: File): Promise<string> {
  const name = `${userId}-${randomBytes(8).toString("hex")}.${EXT[file.type]}`;
  if (privateToken()) {
    const { pathname } = await put(`prescription-scans/${name}`, file, { access: "private", contentType: file.type, token: privateToken() });
    return `blob:${pathname}`;
  }
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(path.join(LOCAL_DIR, name), Buffer.from(await file.arrayBuffer()));
  return `local:prescription-scans/${name}`;
}

export async function readScanImage(ref: string): Promise<{ data: Buffer; contentType: string } | null> {
  const contentType = Object.entries(EXT).find(([, e]) => ref.endsWith(`.${e}`))?.[0] ?? "image/jpeg";
  if (ref.startsWith("local:")) {
    const name = ref.slice("local:prescription-scans/".length);
    if (!/^[\w-]+\.\w+$/.test(name)) return null;
    const data = await readFile(path.join(LOCAL_DIR, name)).catch(() => null);
    return data && { data, contentType };
  }
  if (!ref.startsWith("blob:") || !privateToken()) return null;
  const result = await get(ref.slice(5), { access: "private", token: privateToken() }).catch(() => null);
  if (!result?.stream) return null;
  return { data: Buffer.from(await new Response(result.stream).arrayBuffer()), contentType };
}

/** Who may see a scan's photo: whoever took it, an admin, or a pharmacist with an order made from it. */
export async function maySeeScan(user: User, scanId: string): Promise<boolean> {
  const scan = await prisma.prescriptionScan.findUnique({ where: { id: scanId }, select: { userId: true } });
  if (!scan) return false;
  if (scan.userId === user.id || user.role === Role.ADMIN) return true;
  if (user.role !== Role.PHARMACIST) return false;
  return (await prisma.pharmacyOrder.count({ where: { prescriptionScanId: scanId, pharmacy: { ownerId: user.id } } })) > 0;
}

// ---- Matching to the shop ---------------------------------------------------------------------------

export type ProductMatch = {
  id: string;
  name: string;
  detail: string;
  price: string;
  inStock: number;
  pharmacyName: string;
  /** The product's strength matches the prescribed one. */
  strengthMatches: boolean;
};

const digits = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/**
 * Products in stock whose name matches each medicine (by its first word, which carries the drug
 * name), best strength match first. `pharmacyId` limits it to one pharmacy's shelf.
 */
export async function matchProducts(medicines: ReadMedicine[], pharmacyId?: string): Promise<ProductMatch[][]> {
  return Promise.all(
    medicines.map(async (m) => {
      const word = m.name.trim().split(/[\s/,(]+/)[0];
      if (!word || word.length < 3) return [];
      const products = await prisma.pharmacyProduct.findMany({
        where: {
          name: { contains: word, mode: "insensitive" },
          isActive: true,
          ...(pharmacyId ? { pharmacyId } : { quantity: { gt: 0 }, pharmacy: { isActive: true } }),
        },
        include: { pharmacy: { select: { name: true } } },
        orderBy: { price: "asc" },
        take: 20,
      });
      return products
        .map((p) => ({
          id: p.id,
          name: p.name,
          detail: [p.strength, p.form].filter(Boolean).join(" · "),
          price: p.price.toString(),
          inStock: p.quantity,
          pharmacyName: p.pharmacy.name,
          strengthMatches: !!m.strength && !!p.strength && digits(p.strength) === digits(m.strength),
        }))
        .sort((a, b) => Number(b.strengthMatches) - Number(a.strengthMatches))
        .slice(0, 5);
    }),
  );
}
