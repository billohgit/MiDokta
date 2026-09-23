import "server-only";

import { normalizePhone } from "./phone";

/**
 * Numbers SMS may be sent to, from `SMS_ALLOWED_NUMBERS` (comma-separated). Empty means everyone.
 *
 * A Twilio trial can only text numbers verified in the console, and each attempt at an unverified
 * one is a failed send charged against the trial credit. Listing the verified numbers here keeps
 * development traffic to them: everyone else is logged as skipped, with the reason, instead of
 * failing against the provider.
 */
const allowed = () =>
  (process.env.SMS_ALLOWED_NUMBERS ?? "")
    .split(",")
    .map((n) => normalizePhone(n))
    .filter((n): n is string => !!n);

/** How many numbers the allowlist holds; 0 when it isn't in use. */
export const allowlistSize = () => allowed().length;

/** Why this number can't be texted under the current settings, or null when it can. */
export function allowlistBlock(to: string | null | undefined): string | null {
  const list = allowed();
  if (list.length === 0) return null;
  if (!to) return null; // a missing number is already reported as its own problem
  return list.includes(to) ? null : "Not in the SMS_ALLOWED_NUMBERS test allowlist";
}
