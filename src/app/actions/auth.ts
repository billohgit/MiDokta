"use server";

import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PORTAL_HOME, createSession, destroySession } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH, hashPassword, verifyPassword } from "@/lib/password";
import { PHONE_HINT, enumValue, isEmail, isUniqueViolation, phoneValue, text } from "@/lib/form";
import { notifyRoles } from "@/lib/notifications";
import { SIGNUP_ROLES } from "@/lib/roles";

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
  if (!user.isActive) {
    return { error: "This account is awaiting approval or has been deactivated. Contact an administrator.", email };
  }

  const home = PORTAL_HOME[user.role];
  if (!home) return { error: "There is no portal for your account type yet.", email };

  await createSession(user.id);
  redirect(home);
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export type SignupState = {
  error: string | null;
  done: boolean;
  values: { firstName: string; lastName: string; email: string; phone: string; role: string };
};

/**
 * Self-service sign-up. The account starts inactive: it can't sign in until an admin
 * activates it, so nobody reaches patient records just by filling in this form.
 */
export async function signup(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const values = {
    firstName: text(formData, "firstName") ?? "",
    lastName: text(formData, "lastName") ?? "",
    email: text(formData, "email")?.toLowerCase() ?? "",
    phone: text(formData, "phone") ?? "",
    role: text(formData, "role") ?? "",
  };
  const fail = (error: string): SignupState => ({ error, done: false, values });

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");
  const role = enumValue(formData, "role", SIGNUP_ROLES);
  const phone = phoneValue(formData, "phone");

  if (!values.firstName || !values.lastName || !values.email) return fail("First name, last name and email are required.");
  if (!isEmail(values.email)) return fail("Enter a valid email address.");
  if (!role) return fail("Choose your role.");
  if (phone === undefined) return fail(PHONE_HINT);
  if (password.length < MIN_PASSWORD_LENGTH) return fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (password !== confirm) return fail("Passwords do not match.");

  let user;
  try {
    user = await prisma.user.create({
      data: {
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        phone,
        role,
        password: await hashPassword(password),
        isActive: false,
      },
    });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("An account with that email already exists. Sign in instead.");
    throw e;
  }

  await notifyRoles([Role.ADMIN], {
    type: "GENERAL",
    title: "New account awaiting approval",
    body: `${user.firstName} ${user.lastName} (${user.role.toLowerCase()}) signed up and needs activating.`,
    link: role === Role.DOCTOR ? "/admin/doctors" : "/admin/staff",
  });

  return { error: null, done: true, values };
}
