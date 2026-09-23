import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { type Role, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PORTAL_BASE } from "@/lib/roles";

const COOKIE = "session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must be set to a random string of 32+ characters");
  return new TextEncoder().encode(value);
}

/** The home page for each role that has a portal. */
export const PORTAL_HOME: Partial<Record<Role, string>> = Object.fromEntries(
  Object.entries(PORTAL_BASE).map(([role, base]) => [role, `${base}/dashboard`])
);

export async function createSession(userId: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

/** The signed-in, active user — or null. Cached per request. */
export const getSessionUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    return user?.isActive ? user : null;
  } catch {
    return null;
  }
});

/** For pages and layouts: redirects to /login when signed out or the role doesn't match. */
export async function requireUser(...roles: Role[]): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (roles.length && !roles.includes(user.role)) redirect(PORTAL_HOME[user.role] ?? "/login");
  return user;
}

/** For server actions and API routes: returns null instead of redirecting. */
export async function authorize(...roles: Role[]): Promise<User | null> {
  const user = await getSessionUser();
  if (!user || (roles.length && !roles.includes(user.role))) return null;
  return user;
}
