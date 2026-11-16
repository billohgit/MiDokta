"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MobileWallet, Role, VisitType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize, createSession } from "@/lib/auth";
import { type ActionResult, DENIED, enumValue, fail, isEmail, isUniqueViolation, text } from "@/lib/form";
import { MIN_PASSWORD_LENGTH, hashPassword } from "@/lib/password";
import { normalizePhone } from "@/lib/sms/phone";
import { COUNTRIES, withCountryCode } from "@/lib/countries";
import { placeholderEmail } from "@/lib/people";
import { channelsRefundableTo, walletAccount } from "@/lib/payouts";
import { acceptInvite, createInvite, openInvite } from "@/lib/invites";

const MAX_REASON = 120;

// ---- Doctors ------------------------------------------------------------------------------------

/** A doctor books a visit for someone new and texts them a link to register. */
export async function inviteNewPatient(formData: FormData): Promise<ActionResult> {
  const doctor = await authorize(Role.DOCTOR);
  if (!doctor) return DENIED;

  const firstName = text(formData, "firstName")?.slice(0, 60);
  const lastName = text(formData, "lastName")?.slice(0, 60);
  if (!firstName || !lastName) return fail("Enter the patient's first and last name.");
  const code = COUNTRIES.find((c) => c.iso === text(formData, "country"))?.code;
  const typed = text(formData, "phone");
  const phone = code && typed ? normalizePhone(withCountryCode(code, typed)) : null;
  if (!phone) return fail("Enter the patient's phone number: the registration link is texted to it.");

  const date = text(formData, "date");
  const time = text(formData, "time");
  const startsAt = date && time ? new Date(`${date}T${time}`) : null;
  if (!startsAt || isNaN(startsAt.getTime())) return fail("Choose the date and time of the visit.");
  if (startsAt.getTime() < Date.now() + 60 * 60_000) return fail("Choose a time at least an hour from now, so they have time to register.");
  if (startsAt.getTime() > Date.now() + 365 * 86400_000) return fail("Choose a time within the next year.");
  const visitType = enumValue(formData, "visitType", Object.values(VisitType));
  if (!visitType) return fail("Choose in person or video call.");

  const result = await createInvite({
    doctor,
    firstName,
    lastName,
    phone,
    title: text(formData, "title")?.slice(0, MAX_REASON) ?? "Consultation",
    startsAt,
    visitType,
  });
  if (!result.ok) return fail(result.error);
  revalidatePath("/doctor/patients");
  return { ok: true, id: result.invite.id };
}

export async function cancelInvite(id: string): Promise<ActionResult> {
  const doctor = await authorize(Role.DOCTOR);
  if (!doctor) return DENIED;
  const { count } = await prisma.patientInvite.updateMany({ where: { id, doctorId: doctor.id, status: "PENDING" }, data: { status: "CANCELLED" } });
  if (count === 0) return fail("This invitation can't be cancelled: the patient may have registered already.");
  revalidatePath("/doctor/patients");
  return { ok: true };
}

// ---- The invited patient --------------------------------------------------------------------------

export type InviteSignupState = { error: string | null };

/**
 * Registration from a doctor's invitation link. The account is active straight away, with no ID
 * check (none is needed for patients); the visit is then booked with that
 * doctor and the patient is signed in and taken to pay the fee, or to their appointments.
 */
export async function registerFromInvite(_prev: InviteSignupState, formData: FormData): Promise<InviteSignupState> {
  const fail = (error: string): InviteSignupState => ({ error });
  const invite = await openInvite(text(formData, "token") ?? "");
  if (!invite) return fail("This invitation link has expired or was cancelled. Ask your doctor to send a new one.");

  const firstName = text(formData, "firstName")?.slice(0, 60);
  const lastName = text(formData, "lastName")?.slice(0, 60);
  const email = text(formData, "email")?.toLowerCase() ?? null;
  const password = String(formData.get("password") ?? "");
  if (!firstName || !lastName) return fail("Enter your first and last name.");
  if (email && !isEmail(email)) return fail("Enter a valid email address, or leave it empty.");
  if (password.length < MIN_PASSWORD_LENGTH) return fail(`Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (password !== String(formData.get("confirmPassword") ?? "")) return fail("The two passwords don't match.");
  if (formData.get("acceptTerms") !== "on") return fail("Accept the Terms and Conditions to continue.");

  // With a fee, a refund account is needed in case the visit is cancelled.
  let refund: { wallet: MobileWallet; account: string } | null = null;
  if (invite.fee) {
    const wallet = enumValue(formData, "refundWallet", Object.values(MobileWallet));
    const account = wallet ? walletAccount(wallet, text(formData, "refundAccount") ?? invite.phone) : null;
    if (!wallet || !account) return fail("Enter where a refund should go if the visit is cancelled.");
    if (channelsRefundableTo(wallet).length === 0) return fail("Online payment isn't available for that refund account right now. Choose another.");
    refund = { wallet, account };
  }

  let patient;
  try {
    patient = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email: email ?? placeholderEmail(),
        phone: invite.phone,
        role: Role.PATIENT,
        password: await hashPassword(password),
        isActive: true,
      },
    });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("An account with that email already exists. Use another email, or leave it empty.");
    throw e;
  }

  const next = await acceptInvite(invite, patient, refund);

  await createSession(patient.id);
  redirect(next);
}
