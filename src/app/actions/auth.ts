"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PORTAL_HOME, createSession, destroySession } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";

export type LoginState = { error: string | null; email: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password.", email };

  const user = await prisma.user.findUnique({ where: { email } });
  // Same message for unknown email and wrong password.
  if (!user || !(await verifyPassword(password, user.password))) {
    return { error: "Incorrect email or password.", email };
  }
  if (!user.isActive) return { error: "This account has been deactivated. Contact an administrator.", email };

  const home = PORTAL_HOME[user.role];
  if (!home) return { error: "There is no portal for your account type yet.", email };

  await createSession(user.id);
  redirect(home);
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
