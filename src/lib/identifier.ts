import { isEmail } from "@/lib/form";
import { normalizePhone } from "@/lib/sms/phone";

/**
 * What someone typed in the single "Email or phone number" box on the sign-in and reset pages.
 * With an @ it's an email; otherwise a phone number, where local numbers (076 123 456) are taken
 * as the default country's (Sierra Leone) and other countries' numbers are typed with their code
 * (+234 ...).
 */
export type Identifier = { kind: "email"; email: string } | { kind: "phone"; phone: string };

export const looksLikeEmail = (typed: string) => typed.includes("@");

export function readIdentifier(typed: string): Identifier | null {
  const value = typed.trim();
  if (!value) return null;
  if (looksLikeEmail(value)) return isEmail(value) ? { kind: "email", email: value.toLowerCase() } : null;
  const phone = normalizePhone(value);
  return phone ? { kind: "phone", phone } : null;
}
