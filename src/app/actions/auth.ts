"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PORTAL_HOME, createSession, destroySession } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH, hashPassword, verifyPassword } from "@/lib/password";
import { enumValue, isEmail, isUniqueViolation, text } from "@/lib/form";
import { AVATAR_TYPES, deleteAvatar, deleteIdCard, saveAvatar, saveIdCard } from "@/lib/uploads";
import { verifyIdentity } from "@/lib/verification";
import { normalizePhone } from "@/lib/sms/phone";
import { COUNTRIES, withCountryCode } from "@/lib/countries";
import { notifyRoles } from "@/lib/notifications";
import { SIGNUP_ROLES } from "@/lib/roles";

export type LoginMethod = "email" | "phone";
export type LoginState = { error: string | null; method: LoginMethod; identifier: string; country: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const method: LoginMethod = formData.get("method") === "phone" ? "phone" : "email";
  const identifier = String(formData.get("identifier") ?? "").trim();
  const country = String(formData.get("country") ?? "");
  const password = String(formData.get("password") ?? "");
  const fail = (error: string): LoginState => ({ error, method, identifier, country });
  const label = method === "phone" ? "phone number" : "email";
  if (!identifier || !password) return fail(`Enter your ${label} and password.`);

  let user;
  if (method === "phone") {
    const code = COUNTRIES.find((c) => c.iso === country)?.code;
    const phone = code && normalizePhone(withCountryCode(code, identifier));
    if (!phone) return fail("Enter a valid phone number for the selected country.");
    // Phone numbers are stored as typed and aren't unique, so compare normalised values.
    const candidates = await prisma.user.findMany({ where: { phone: { not: null } } });
    const matches = candidates.filter((u) => normalizePhone(u.phone) === phone);
    // A number can be shared (e.g. within a family): the password decides which account it is.
    const verified = [];
    for (const u of matches) if (await verifyPassword(password, u.password)) verified.push(u);
    if (verified.length > 1) return fail("More than one account uses this phone number. Sign in with your email instead.");
    user = verified[0];
  } else {
    user = await prisma.user.findUnique({ where: { email: identifier.toLowerCase() } });
    if (user && !(await verifyPassword(password, user.password))) user = null;
  }

  // Same message for unknown account and wrong password.
  if (!user) return fail(`Incorrect ${label} or password.`);
  if (!user.isActive) {
    return fail("This account is awaiting approval or has been deactivated. Contact an administrator.");
  }

  const home = PORTAL_HOME[user.role];
  if (!home) return fail("There is no portal for your account type yet.");

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
  values: { firstName: string; lastName: string; email: string; country: string; phone: string; role: string };
};

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** An uploaded image field, or an error message. */
function imageField(formData: FormData, key: string, label: string): File | string {
  const file = formData.get(key);
  if (!(file instanceof File) || file.size === 0) return `Add your ${label}.`;
  if (!AVATAR_TYPES[file.type]) return `Your ${label} must be a JPEG, PNG or WebP image.`;
  if (file.size > MAX_IMAGE_BYTES) return `Your ${label} must be 2 MB or smaller.`;
  return file;
}

/**
 * Self-service sign-up. The account starts inactive: it can't sign in until an admin
 * activates it, so nobody reaches patient records just by filling in this form. The photo
 * and ID card are checked automatically afterwards to help the admin decide.
 */
export async function signup(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const values = {
    firstName: text(formData, "firstName") ?? "",
    lastName: text(formData, "lastName") ?? "",
    email: text(formData, "email")?.toLowerCase() ?? "",
    country: text(formData, "country") ?? "",
    phone: text(formData, "phone") ?? "",
    role: text(formData, "role") ?? "",
  };
  const fail = (error: string): SignupState => ({ error, done: false, values });

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");
  const role = enumValue(formData, "role", SIGNUP_ROLES);
  const code = COUNTRIES.find((c) => c.iso === values.country)?.code;
  const phone = code && values.phone ? withCountryCode(code, values.phone) : null;
  const photo = imageField(formData, "photo", "photo");
  const idCard = imageField(formData, "idCard", "identity card");

  if (!values.firstName || !values.lastName || !values.email) return fail("First name, last name and email are required.");
  if (!isEmail(values.email)) return fail("Enter a valid email address.");
  if (!values.phone) return fail("Enter your phone number.");
  if (!phone || !normalizePhone(phone)) return fail("Enter a valid phone number for the selected country.");
  if (!role) return fail("Choose your role.");
  if (typeof photo === "string") return fail(photo);
  if (typeof idCard === "string") return fail(idCard);
  if (password.length < MIN_PASSWORD_LENGTH) return fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (password !== confirm) return fail("Passwords do not match.");

  // Phone numbers are stored as typed, so compare normalised values.
  const normalized = normalizePhone(phone);
  const withPhones = await prisma.user.findMany({ where: { phone: { not: null } }, select: { phone: true } });
  if (withPhones.some((u) => normalizePhone(u.phone) === normalized)) {
    return fail("An account with that phone number already exists. Sign in instead.");
  }

  const fileId = randomUUID();
  const avatarUrl = await saveAvatar(`${fileId}.${AVATAR_TYPES[photo.type]}`, photo);
  const idCardUrl = await saveIdCard(`${fileId}.${AVATAR_TYPES[idCard.type]}`, idCard);

  let user;
  try {
    user = await prisma.user.create({
      data: {
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        phone,
        role,
        avatarUrl,
        idCardUrl,
        verificationStatus: "PENDING",
        password: await hashPassword(password),
        isActive: false,
      },
    });
  } catch (e) {
    await Promise.all([deleteAvatar(avatarUrl), deleteIdCard(idCardUrl)]);
    if (isUniqueViolation(e)) return fail("An account with that email already exists. Sign in instead.");
    throw e;
  }

  await notifyRoles([Role.ADMIN], {
    type: "GENERAL",
    title: "New account awaiting approval",
    body: `${user.firstName} ${user.lastName} (${user.role.toLowerCase()}) signed up and needs activating.`,
    link: "/admin/verifications",
  });

  // The check takes a while, so run it once the response has gone out.
  after(() => verifyIdentity(user.id));

  return { error: null, done: true, values };
}
