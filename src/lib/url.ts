import "server-only";

import { headers } from "next/headers";

/** The app's public origin for links we text out. Uses APP_URL, else the current request's host. */
export async function appBaseUrl(): Promise<string> {
  const base = process.env.APP_URL?.replace(/\/+$/, "");
  if (base) return base;
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}
