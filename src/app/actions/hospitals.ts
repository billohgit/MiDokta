"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/auth";
import { type ActionResult, DENIED, fail, isEmail, text } from "@/lib/form";

const refresh = () => revalidatePath("/", "layout");

export async function saveHospital(formData: FormData): Promise<ActionResult> {
  if (!(await authorize(Role.ADMIN))) return DENIED;

  const id = text(formData, "id");
  const name = text(formData, "name");
  const email = text(formData, "email");
  if (!name) return fail("Hospital name is required.");
  if (email && !isEmail(email)) return fail("Enter a valid email address.");

  const data = {
    name,
    email,
    phone: text(formData, "phone"),
    address: text(formData, "address"),
    city: text(formData, "city"),
  };

  if (id) {
    const { count } = await prisma.hospital.updateMany({ where: { id }, data });
    if (count === 0) return fail("Hospital not found.");
  } else {
    await prisma.hospital.create({ data });
  }

  refresh();
  return { ok: true };
}

export async function setHospitalActive(id: string, isActive: boolean): Promise<ActionResult> {
  if (!(await authorize(Role.ADMIN))) return DENIED;
  const { count } = await prisma.hospital.updateMany({ where: { id }, data: { isActive } });
  if (count === 0) return fail("Hospital not found.");
  refresh();
  return { ok: true };
}

export async function deleteHospital(id: string): Promise<ActionResult> {
  if (!(await authorize(Role.ADMIN))) return DENIED;

  const hospital = await prisma.hospital.findUnique({
    where: { id },
    include: { _count: { select: { staff: true, appointments: true, invoices: true } } },
  });
  if (!hospital) return fail("Hospital not found.");
  const { staff, appointments, invoices } = hospital._count;
  if (staff + appointments + invoices > 0) {
    return fail("This hospital has staff, appointments or invoices linked to it. Deactivate it instead.");
  }

  await prisma.hospital.delete({ where: { id } });
  refresh();
  return { ok: true };
}
