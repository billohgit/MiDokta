/** Country calling code used for local numbers such as "076 123456" (default: Sierra Leone). */
export const DEFAULT_COUNTRY_CODE = (process.env.SMS_DEFAULT_COUNTRY_CODE ?? "232").replace(/\D/g, "");

/**
 * Normalises a phone number to E.164 (e.g. "+23276123456"), or returns null if it can't be.
 * Accepts "+232 76 123 456", "00232…", local "076 123456" / "76123456", and punctuation.
 */
export function normalizePhone(raw: string | null | undefined, countryCode = DEFAULT_COUNTRY_CODE): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/[^\d\s+().-]/.test(trimmed)) return null; // letters etc.

  let digits = trimmed.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = countryCode + digits.slice(1);
  else if (digits.length <= 9) digits = countryCode + digits;

  if (digits.includes("+") || !/^[1-9]\d{7,14}$/.test(digits)) return null;
  return `+${digits}`;
}

export const PHONE_HINT = `Enter a valid phone number, e.g. +${DEFAULT_COUNTRY_CODE} 76 123 456`;
