"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PORTAL_HOME, createSession, destroySession } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH, hashPassword, verifyPassword } from "@/lib/password";
import { enumValue, isUniqueViolation, text } from "@/lib/form";
import { AVATAR_TYPES, deleteAvatar, deleteIdCard, saveAvatar, saveIdCard } from "@/lib/uploads";
import { verifyIdentity } from "@/lib/verification";
import { normalizePhone } from "@/lib/sms/phone";
import { notifyRoles } from "@/lib/notifications";
import { SIGNUP_ROLES } from "@/lib/roles";
import { checkLoginCode, redeemLoginCode, sendLoginCode } from "@/lib/login-codes";
import { findAccount, resetPassword, sendResetCode } from "@/lib/password-reset";
import { looksLikeEmail, readIdentifier } from "@/lib/identifier";
import { placeholderEmail } from "@/lib/people";

export type LoginMethod = "email" | "phone";
export type LoginState = { error: string | null; method: LoginMethod; identifier: string; country: string };

/** Sign in with a password, from one box that takes an email or a phone number (src/lib/identifier.ts). */
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const id = readIdentifier(identifier);
  const method: LoginMethod = id?.kind ?? (looksLikeEmail(identifier) ? "email" : "phone");
  const fail = (error: string): LoginState => ({ error, method, identifier, country: "" });
  if (!identifier || !password) return fail("Enter your email or phone number, and your password.");
  if (!id) return fail(method === "email" ? "Enter a valid email address." : "Enter a valid phone number with its country code, e.g. +232 76 123 456.");
  const label = id.kind === "phone" ? "phone number" : "email";

  let user;
  if (id.kind === "phone") {
    const phone = id.phone;
    // Phone numbers are stored as typed and aren't unique, so compare normalised values.
    const candidates = await prisma.user.findMany({ where: { phone: { not: null } } });
    const matches = candidates.filter((u) => normalizePhone(u.phone) === phone);
    // A number can be shared (e.g. within a family): the password decides which account it is.
    const verified = [];
    for (const u of matches) if (await verifyPassword(password, u.password)) verified.push(u);
    if (verified.length > 1) return fail("More than one account uses this phone number. Sign in with your email instead.");
    user = verified[0];
  } else {
    user = await prisma.user.findUnique({ where: { email: id.email } });
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

export type PatientLoginStep = "phone" | "code" | "choose";
export type PatientLoginState = {
  step: PatientLoginStep;
  error: string | null;
  notice: string | null;
  country: string;
  /** The number as typed, to refill the form. */
  identifier: string;
  /** Normalised number the code went to. */
  phone: string;
  /** When several patients share the number: who to sign in as, once the code is right. */
  codeId: string | null;
  choices: { id: string; name: string }[];
};

/**
 * Patient sign-in, one step per submit: send a code to the phone number, check the code, and (when
 * several patients share the number) pick who is signing in.
 */
export async function patientLogin(prev: PatientLoginState, formData: FormData): Promise<PatientLoginState> {
  const intent = String(formData.get("intent") ?? "");
  const state = { ...prev, error: null, notice: null };
  const fail = (error: string, patch: Partial<PatientLoginState> = {}): PatientLoginState => ({ ...state, ...patch, error });

  if (intent === "back") return { ...state, step: "phone", codeId: null, choices: [] };

  if (intent === "send" || intent === "resend") {
    const identifier = intent === "send" ? String(formData.get("identifier") ?? "").trim() : prev.identifier;
    const country = prev.country;
    const id = readIdentifier(identifier);
    if (id?.kind === "email") return fail("To sign in with your email, enter your password too.", { identifier });
    const phone = id?.phone;
    if (!phone) return fail("Enter a valid phone number with its country code, e.g. +232 76 123 456.", { identifier });

    const sent = await sendLoginCode(phone);
    if (!sent.ok) return fail(sent.error, { identifier, country });
    return {
      ...state,
      step: "code",
      identifier,
      country,
      phone,
      notice: "If this number is registered with the clinic, a 6-digit code is on its way by text.",
    };
  }

  if (intent === "verify") {
    const code = String(formData.get("code") ?? "").trim();
    if (!/^\d{6}$/.test(code.replace(/\s/g, ""))) return fail("Enter the 6-digit code from the text message.");
    const check = await checkLoginCode(prev.phone, code.replace(/\s/g, ""));
    if (!check.ok) return fail(check.error);
    if (check.patients.length > 1) {
      return {
        ...state,
        step: "choose",
        codeId: check.codeId,
        choices: check.patients.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}` })),
      };
    }
    return signInPatient(check.codeId, check.patients[0].id, fail);
  }

  // The "who is signing in" buttons submit only the chosen patient's id.
  if (prev.step === "choose" && prev.codeId && formData.has("userId")) {
    return signInPatient(prev.codeId, String(formData.get("userId") ?? ""), fail);
  }
  return fail("Something went wrong. Start again.", { step: "phone" });
}

async function signInPatient(codeId: string, userId: string, fail: (e: string, p?: Partial<PatientLoginState>) => PatientLoginState) {
  if (!(await redeemLoginCode(codeId, userId))) {
    return fail("That code has expired. Send a new one.", { step: "phone", codeId: null, choices: [] });
  }
  await createSession(userId);
  redirect(PORTAL_HOME.PATIENT!);
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export type ResetState = {
  step: "request" | "reset";
  error: string | null;
  notice: string | null;
  method: LoginMethod;
  identifier: string;
  country: string;
};

/**
 * Forgot password, one step per submit: text a code to the account's phone, then check the code and
 * set the new password (signing in, and out everywhere else). Never says whether the account exists.
 */
export async function passwordReset(prev: ResetState, formData: FormData): Promise<ResetState> {
  const intent = String(formData.get("intent") ?? "");
  // Typed in one box: an email or a phone number (src/lib/identifier.ts).
  const identifier = String(formData.get("identifier") ?? "").trim();
  const id = readIdentifier(identifier);
  const method: LoginMethod = id?.kind ?? (looksLikeEmail(identifier) ? "email" : "phone");
  const state = { ...prev, method, identifier, error: null, notice: null };
  if (!id) return { ...state, step: "request", error: "Enter the email address or phone number on your account." };
  const account: { email: string } | { phone: string } = id.kind === "email" ? { email: id.email } : { phone: id.phone };
  const user = await findAccount(account);

  if (intent === "send" || intent === "resend") {
    const sent = await sendResetCode(user);
    if (!sent.ok) return { ...state, error: sent.error };
    return {
      ...state,
      step: "reset",
      notice:
        "If an account matches and has a phone number, we've texted it a 6-digit code. No text after a few minutes? Check the number, or ask an administrator to reset your password.",
    };
  }

  const code = String(formData.get("code") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!/^\d{6}$/.test(code.replace(/\D/g, ""))) return { ...state, step: "reset", error: "Enter the 6-digit code from the text." };
  if (password.length < MIN_PASSWORD_LENGTH) return { ...state, step: "reset", error: `Use at least ${MIN_PASSWORD_LENGTH} characters for your new password.` };
  if (password !== String(formData.get("confirm") ?? "")) return { ...state, step: "reset", error: "The two passwords don't match." };

  const result = await resetPassword(user, code, password);
  if (!result.ok) return { ...state, step: "reset", error: result.error };

  const home = PORTAL_HOME[result.user.role];
  if (!home) return { ...state, step: "reset", notice: "Your password is changed. You can now sign in.", error: null };
  await createSession(result.user.id);
  redirect(home);
}

export type SignupState = {
  error: string | null;
  done: boolean;
  /** `identifier`: the email or phone number typed in the one box. */
  values: { firstName: string; lastName: string; identifier: string; role: string; mainIllness: string };
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
 * Self-service sign-up.
 *
 * - Patients: no ID card and no approval. The account is active straight away and they're signed
 *   in; a photo is optional.
 * - Doctors and staff: a photo and ID card are required, checked automatically, and the account
 *   stays inactive until an admin approves it, so nobody reaches patient records just by
 *   filling in this form.
 */
export async function signup(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const values = {
    firstName: text(formData, "firstName") ?? "",
    lastName: text(formData, "lastName") ?? "",
    // One box: an email or a phone number (src/lib/identifier.ts).
    identifier: text(formData, "identifier") ?? "",
    role: text(formData, "role") ?? "",
    // Optional, patients only: what they mainly need help with, for doctor and medicine suggestions.
    mainIllness: text(formData, "mainIllness")?.slice(0, 120) ?? "",
  };
  const fail = (error: string): SignupState => ({ error, done: false, values });

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");
  const role = enumValue(formData, "role", SIGNUP_ROLES);
  const id = readIdentifier(values.identifier);
  // Without an email the account gets a hidden placeholder one (emails must be unique); without a
  // phone number there are no texted codes or SMS reminders.
  const email = id?.kind === "email" ? id.email : null;
  const phone = id?.kind === "phone" ? id.phone : null;
  const isPatient = role === Role.PATIENT;
  const photoGiven = formData.get("photo") instanceof File && (formData.get("photo") as File).size > 0;
  const photo = isPatient && !photoGiven ? null : imageField(formData, "photo", "photo");
  const idCard = isPatient ? null : imageField(formData, "idCard", "identity card");

  if (!values.firstName || !values.lastName) return fail("Enter your first and last name.");
  if (!values.identifier) return fail("Enter your email or phone number.");
  if (!id) return fail(looksLikeEmail(values.identifier) ? "Enter a valid email address." : "Enter a valid phone number with its country code, e.g. +232 76 123 456.");
  if (!role) return fail("Choose your role.");
  if (typeof photo === "string") return fail(photo);
  if (typeof idCard === "string") return fail(idCard);
  if (password.length < MIN_PASSWORD_LENGTH) return fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (password !== confirm) return fail("Passwords do not match.");
  if (formData.get("acceptTerms") !== "on") return fail("Accept the Terms and Conditions to create an account.");

  // Phone numbers are stored as typed, so compare normalised values.
  if (phone) {
    const withPhones = await prisma.user.findMany({ where: { phone: { not: null } }, select: { phone: true } });
    if (withPhones.some((u) => normalizePhone(u.phone) === phone)) {
      return fail("An account with that phone number already exists. Sign in instead.");
    }
  }

  const fileId = randomUUID();
  const avatarUrl = photo ? await saveAvatar(`${fileId}.${AVATAR_TYPES[photo.type]}`, photo) : null;
  const idCardUrl = idCard
    ? await saveIdCard(`${fileId}.${AVATAR_TYPES[idCard.type]}`, idCard).catch(async (e) => {
        await deleteAvatar(avatarUrl);
        throw e;
      })
    : null;

  let user;
  try {
    user = await prisma.user.create({
      data: {
        firstName: values.firstName,
        lastName: values.lastName,
        email: email ?? placeholderEmail(),
        phone,
        role,
        mainIllness: isPatient && values.mainIllness ? values.mainIllness : null,
        avatarUrl,
        idCardUrl,
        verificationStatus: isPatient ? null : "PENDING",
        password: await hashPassword(password),
        isActive: isPatient,
      },
    });
  } catch (e) {
    await Promise.all([deleteAvatar(avatarUrl), deleteIdCard(idCardUrl)]);
    if (isUniqueViolation(e)) return fail("An account with that email already exists. Sign in instead.");
    throw e;
  }

  if (isPatient) {
    await createSession(user.id);
    redirect(PORTAL_HOME[Role.PATIENT] ?? "/patient/dashboard");
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
