/** Helpers for reading and validating FormData in server actions. */

import { PHONE_HINT, normalizePhone } from "@/lib/sms/phone";

export { PHONE_HINT };

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

export const fail = (error: string): ActionResult => ({ ok: false, error });

export const DENIED = fail("You are not allowed to do that.");

/** Trimmed string, or null when empty. */
export const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim() || null;

export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/** Enum member, null when empty, or undefined when the value is not a member. */
export function enumValue<T extends string>(formData: FormData, key: string, values: readonly T[]): T | null | undefined {
  const value = text(formData, key);
  if (value === null) return null;
  return (values as readonly string[]).includes(value) ? (value as T) : undefined;
}

/** Integer within [min, max], null when empty, or undefined when invalid. */
export function intValue(formData: FormData, key: string, min: number, max: number): number | null | undefined {
  const value = text(formData, key);
  if (value === null) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
}

/** Decimal within [min, max] as a string (safe for Prisma Decimal), null when empty, or undefined when invalid. */
export function decimalValue(formData: FormData, key: string, min: number, max: number): string | null | undefined {
  const value = text(formData, key);
  if (value === null) return null;
  if (!/^\d+(\.\d+)?$/.test(value)) return undefined;
  const n = Number(value);
  return n >= min && n <= max ? value : undefined;
}

/** A YYYY-MM-DD date stored as a UTC midnight Date, null when empty, or undefined when invalid. */
export function dateValue(formData: FormData, key: string): Date | null | undefined {
  const value = text(formData, key);
  if (value === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const d = new Date(`${value}T00:00:00Z`);
  return isNaN(d.getTime()) ? undefined : d;
}

/** Phone number as typed (trimmed), null when empty, or undefined when it can't be used for SMS. */
export function phoneValue(formData: FormData, key: string): string | null | undefined {
  const value = text(formData, key);
  if (value === null) return null;
  return normalizePhone(value) ? value : undefined;
}

/** Checkbox value: true when ticked. */
export const checkbox = (formData: FormData, key: string) => formData.get(key) === "on";

/** Postgres unique-constraint violation from Prisma. */
export const isUniqueViolation = (e: unknown) =>
  typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002";
