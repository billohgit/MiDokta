"use server";

import { revalidatePath } from "next/cache";
import { Gender, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH, hashPassword } from "@/lib/password";
import {
  type ActionResult,
  DENIED,
  PHONE_HINT,
  checkbox,
  enumValue,
  fail,
  isEmail,
  isUniqueViolation,
  phoneValue,
  text,
} from "@/lib/form";

/** Roles managed on the Staff page (doctors and patients have their own pages). */
const STAFF_ROLES = [Role.ADMIN, Role.NURSE, Role.PHARMACIST, Role.RECEPTIONIST] as const;

const refresh = () => revalidatePath("/", "layout");

/** True if removing this admin would leave no active admin. */
async function isLastActiveAdmin(userId: string) {
  const others = await prisma.user.count({ where: { role: Role.ADMIN, isActive: true, id: { not: userId } } });
  return others === 0;
}

export async function saveStaff(formData: FormData): Promise<ActionResult> {
  const me = await authorize(Role.ADMIN);
  if (!me) return DENIED;

  const id = text(formData, "id");
  const firstName = text(formData, "firstName");
  const lastName = text(formData, "lastName");
  const email = text(formData, "email")?.toLowerCase() ?? null;
  const password = String(formData.get("password") ?? "");
  const role = enumValue(formData, "role", STAFF_ROLES);
  const gender = enumValue(formData, "gender", Object.values(Gender));
  const hospitalId = text(formData, "hospitalId");
  const phone = phoneValue(formData, "phone");

  if (!firstName || !lastName || !email) return fail("First name, last name and email are required.");
  if (!isEmail(email)) return fail("Enter a valid email address.");
  if (!role) return fail("Choose a valid role.");
  if (gender === undefined) return fail("Invalid gender.");
  if (phone === undefined) return fail(PHONE_HINT);
  if ((!id || password) && password.length < MIN_PASSWORD_LENGTH) {
    return fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (hospitalId && !(await prisma.hospital.findUnique({ where: { id: hospitalId } }))) {
    return fail("Hospital not found.");
  }

  const data = {
    firstName,
    lastName,
    email,
    role,
    gender,
    hospitalId,
    phone,
    smsOptIn: checkbox(formData, "smsOptIn"),
    ...(password ? { password: await hashPassword(password) } : {}),
  };

  try {
    if (id) {
      const existing = await prisma.user.findFirst({ where: { id, role: { in: [...STAFF_ROLES] } } });
      if (!existing) return fail("Staff member not found.");
      if (existing.role === Role.ADMIN && role !== Role.ADMIN) {
        if (id === me.id) return fail("You can't remove your own admin role.");
        if (await isLastActiveAdmin(id)) return fail("There must be at least one active admin.");
      }
      await prisma.user.update({ where: { id }, data });
    } else {
      await prisma.user.create({ data: { ...data, password: data.password! } });
    }
  } catch (e) {
    if (isUniqueViolation(e)) return fail("That email is already in use.");
    throw e;
  }

  refresh();
  return { ok: true };
}

export async function setStaffActive(id: string, isActive: boolean): Promise<ActionResult> {
  const me = await authorize(Role.ADMIN);
  if (!me) return DENIED;

  const user = await prisma.user.findFirst({ where: { id, role: { in: [...STAFF_ROLES] } } });
  if (!user) return fail("Staff member not found.");
  if (!isActive) {
    if (id === me.id) return fail("You can't deactivate your own account.");
    if (user.role === Role.ADMIN && (await isLastActiveAdmin(id))) return fail("There must be at least one active admin.");
  }

  await prisma.user.update({ where: { id }, data: { isActive } });
  refresh();
  return { ok: true };
}

export async function deleteStaff(id: string): Promise<ActionResult> {
  const me = await authorize(Role.ADMIN);
  if (!me) return DENIED;
  if (id === me.id) return fail("You can't delete your own account.");

  const user = await prisma.user.findFirst({
    where: { id, role: { in: [...STAFF_ROLES] } },
    include: { _count: { select: { paymentsReceived: true } } },
  });
  if (!user) return fail("Staff member not found.");
  if (user.role === Role.ADMIN && (await isLastActiveAdmin(id))) return fail("There must be at least one active admin.");
  if (user._count.paymentsReceived > 0) {
    return fail("This person has recorded payments and can't be deleted. Deactivate them instead.");
  }

  await prisma.user.delete({ where: { id } });
  refresh();
  return { ok: true };
}
