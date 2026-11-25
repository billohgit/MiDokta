import { isEmail } from "@/lib/form";
import { hasCountryCode, normalizePhone } from "@/lib/sms/phone";

/**
 * What someone typed in the single "Email or phone number" box on the sign-in and reset pages.
 * With an @ it's an email; otherwise a phone number, which must start with its country code
 * (+232 76 123 456 for Sierra Leone, +234 ... for Nigeria).
 */
export type Identifier = { kind: "email"; email: string } | { kind: "phone"; phone: string };

export const looksLikeEmail = (typed: string) => typed.includes("@");

export function readIdentifier(typed: string): Identifier | null {
  const value = typed.trim();
  if (!value) return null;
  if (looksLikeEmail(value)) return isEmail(value) ? { kind: "email", email: value.toLowerCase() } : null;
  const phone = hasCountryCode(value) ? normalizePhone(value) : null;
  return phone ? { kind: "phone", phone } : null;
}
