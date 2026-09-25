"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/auth";
import { type ActionResult, DENIED, fail } from "@/lib/form";
import { deleteAvatar, deleteIdCard } from "@/lib/uploads";
import { verifyIdentity } from "@/lib/verification";

const refresh = () => revalidatePath("/", "layout");

/** A self-service sign-up that hasn't been approved yet. */
const findPending = (id: string) =>
  prisma.user.findFirst({ where: { id, isActive: false, verificationStatus: { not: null } } });

export async function approveSignup(id: string): Promise<ActionResult> {
  if (!(await authorize(Role.ADMIN))) return DENIED;
  if (!(await findPending(id))) return fail("This sign-up was already handled.");

  await prisma.user.update({ where: { id }, data: { isActive: true } });
  refresh();
  return { ok: true };
}

/** Deletes the pending account along with its photo and ID card. */
export async function rejectSignup(id: string): Promise<ActionResult> {
  if (!(await authorize(Role.ADMIN))) return DENIED;
  const user = await findPending(id);
  if (!user) return fail("This sign-up was already handled.");

  try {
    await prisma.user.delete({ where: { id } });
  } catch {
    return fail("This account already has activity and can't be deleted. Leave it deactivated instead.");
  }
  await Promise.all([deleteAvatar(user.avatarUrl), deleteIdCard(user.idCardUrl)]);
  refresh();
  return { ok: true };
}

export async function rerunVerification(id: string): Promise<ActionResult> {
  if (!(await authorize(Role.ADMIN))) return DENIED;
  if (!(await findPending(id))) return fail("This sign-up was already handled.");

  await prisma.user.update({ where: { id }, data: { verificationStatus: "PENDING" } });
  after(() => verifyIdentity(id));
  refresh();
  return { ok: true };
}
