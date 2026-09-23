"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { Gender, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { BLOOD_GROUPS, placeholderEmail } from "@/lib/people";
import {
  type ActionResult,
  DENIED,
  PHONE_HINT,
  checkbox,
  dateValue,
  enumValue,
  fail,
  isEmail,
  isUniqueViolation,
  phoneValue,
  text,
} from "@/lib/form";
import { FRONT_DESK_ROLES } from "@/lib/roles";

const refresh = () => revalidatePath("/", "layout");

export async function savePatient(formData: FormData): Promise<ActionResult> {
  if (!(await authorize(...FRONT_DESK_ROLES))) return DENIED;

  const id = text(formData, "id");
  const firstName = text(formData, "firstName");
  const lastName = text(formData, "lastName");
  const email = text(formData, "email")?.toLowerCase() ?? null;
  const gender = enumValue(formData, "gender", Object.values(Gender));
  const bloodGroup = enumValue(formData, "bloodGroup", BLOOD_GROUPS);
  const dateOfBirth = dateValue(formData, "dateOfBirth");
  const phone = phoneValue(formData, "phone");

  if (!firstName || !lastName) return fail("First and last name are required.");
  if (email && !isEmail(email)) return fail("Enter a valid email address.");
  if (gender === undefined) return fail("Invalid gender.");
  if (phone === undefined) return fail(PHONE_HINT);
  if (bloodGroup === undefined) return fail("Invalid blood group.");
  if (dateOfBirth === undefined || (dateOfBirth && dateOfBirth > new Date())) return fail("Enter a valid date of birth.");

  const data = {
    firstName,
    lastName,
    gender,
    bloodGroup,
    dateOfBirth,
    phone,
    smsOptIn: checkbox(formData, "smsOptIn"),
    address: text(formData, "address"),
    city: text(formData, "city"),
    allergies: text(formData, "allergies"),
    chronicConditions: text(formData, "chronicConditions"),
    emergencyContactName: text(formData, "emergencyContactName"),
    emergencyContactPhone: text(formData, "emergencyContactPhone"),
  };

  try {
    if (id) {
      const existing = await prisma.user.findFirst({ where: { id, role: Role.PATIENT } });
      if (!existing) return fail("Patient not found.");
      // Keep the existing placeholder when no email is given.
      await prisma.user.update({ where: { id }, data: { ...data, ...(email ? { email } : {}) } });
      refresh();
      return { ok: true, id };
    }

    const created = await prisma.user.create({
      data: {
        ...data,
        email: email ?? placeholderEmail(),
        role: Role.PATIENT,
        // Patients don't sign in yet; give them an unusable random password.
        password: await hashPassword(randomBytes(32).toString("hex")),
      },
    });
    refresh();
    return { ok: true, id: created.id };
  } catch (e) {
    if (isUniqueViolation(e)) return fail("That email is already in use.");
    throw e;
  }
}

export async function setPatientActive(id: string, isActive: boolean): Promise<ActionResult> {
  if (!(await authorize(...FRONT_DESK_ROLES))) return DENIED;
  const { count } = await prisma.user.updateMany({ where: { id, role: Role.PATIENT }, data: { isActive } });
  if (count === 0) return fail("Patient not found.");
  refresh();
  return { ok: true };
}

// Deleting a patient stays with admins; receptionists deactivate instead.
export async function deletePatient(id: string): Promise<ActionResult> {
  if (!(await authorize(Role.ADMIN))) return DENIED;

  const patient = await prisma.user.findFirst({
    where: { id, role: Role.PATIENT },
    include: { _count: { select: { patientAppointments: true, patientRecords: true, invoices: true } } },
  });
  if (!patient) return fail("Patient not found.");
  const { patientAppointments, patientRecords, invoices } = patient._count;
  if (patientAppointments + patientRecords + invoices > 0) {
    return fail("This patient has appointments, records or invoices and can't be deleted. Deactivate them instead.");
  }

  await prisma.user.delete({ where: { id } });
  refresh();
  return { ok: true };
}
