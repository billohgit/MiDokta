"use server";

import { revalidatePath } from "next/cache";
import { Gender, Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH, hashPassword } from "@/lib/password";
import { PHONE_HINT, checkbox, phoneValue } from "@/lib/form";

export type ActionResult = { ok: true } | { ok: false; error: string };

const DENIED: ActionResult = { ok: false, error: "You are not allowed to do that." };

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim() || null;

const refresh = () => revalidatePath("/", "layout");

/** Creates a doctor when `id` is empty, otherwise updates that doctor. */
export async function saveDoctor(formData: FormData): Promise<ActionResult> {
  if (!(await authorize(Role.ADMIN))) return DENIED;

  const id = text(formData, "id");
  const firstName = text(formData, "firstName");
  const lastName = text(formData, "lastName");
  const email = text(formData, "email")?.toLowerCase() ?? null;
  const password = String(formData.get("password") ?? "");

  if (!firstName || !lastName || !email) return { ok: false, error: "First name, last name and email are required." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Enter a valid email address." };
  if ((!id || password) && password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  const phone = phoneValue(formData, "phone");
  if (phone === undefined) return { ok: false, error: PHONE_HINT };

  const gender = text(formData, "gender") as Gender | null;
  if (gender && !Object.values(Gender).includes(gender)) return { ok: false, error: "Invalid gender." };

  const experience = text(formData, "experienceYears");
  const experienceYears = experience === null ? null : Number(experience);
  if (experienceYears !== null && (!Number.isInteger(experienceYears) || experienceYears < 0 || experienceYears > 70)) {
    return { ok: false, error: "Years of experience must be a whole number between 0 and 70." };
  }

  const hospitalId = text(formData, "hospitalId");
  if (hospitalId && !(await prisma.hospital.findUnique({ where: { id: hospitalId } }))) {
    return { ok: false, error: "Hospital not found." };
  }

  const data = {
    firstName,
    lastName,
    email,
    phone,
    smsOptIn: checkbox(formData, "smsOptIn"),
    gender,
    specialty: text(formData, "specialty"),
    licenseNumber: text(formData, "licenseNumber"),
    experienceYears,
    bio: text(formData, "bio"),
    hospitalId,
    ...(password ? { password: await hashPassword(password) } : {}),
  };

  try {
    if (id) {
      const existing = await prisma.user.findFirst({ where: { id, role: Role.DOCTOR } });
      if (!existing) return { ok: false, error: "Doctor not found." };
      await prisma.user.update({ where: { id }, data });
    } else {
      await prisma.user.create({ data: { ...data, password: data.password!, role: Role.DOCTOR } });
    }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "That email is already in use." };
    }
    throw e;
  }

  refresh();
  return { ok: true };
}

export async function setDoctorActive(id: string, isActive: boolean): Promise<ActionResult> {
  if (!(await authorize(Role.ADMIN))) return DENIED;

  const { count } = await prisma.user.updateMany({ where: { id, role: Role.DOCTOR }, data: { isActive } });
  if (count === 0) return { ok: false, error: "Doctor not found." };

  refresh();
  return { ok: true };
}

export async function deleteDoctor(id: string): Promise<ActionResult> {
  if (!(await authorize(Role.ADMIN))) return DENIED;

  const [appointments, records] = await Promise.all([
    prisma.appointment.count({ where: { doctorId: id } }),
    prisma.medicalRecord.count({ where: { doctorId: id } }),
  ]);
  if (appointments + records > 0) {
    return {
      ok: false,
      error: "This doctor has appointment history and can't be deleted. Deactivate them instead.",
    };
  }

  const { count } = await prisma.user.deleteMany({ where: { id, role: Role.DOCTOR } });
  if (count === 0) return { ok: false, error: "Doctor not found." };

  refresh();
  return { ok: true };
}
