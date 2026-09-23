"use server";

import { revalidatePath } from "next/cache";
import { Gender, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/auth";
import { PHONE_HINT, checkbox, phoneValue } from "@/lib/form";
import { AVATAR_TYPES, deleteAvatar, saveAvatar } from "@/lib/uploads";

export type ActionResult = { ok: true } | { ok: false; error: string };

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const text = (formData: FormData, key: string) => {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
};

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const user = await authorize();
  if (!user) return { ok: false, error: "Please sign in again." };

  const firstName = text(formData, "firstName");
  const lastName = text(formData, "lastName");
  const email = text(formData, "email");
  if (!firstName || !lastName || !email) return { ok: false, error: "Name and email are required." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Enter a valid email address." };

  const gender = text(formData, "gender") as Gender | null;
  if (gender && !Object.values(Gender).includes(gender)) return { ok: false, error: "Invalid gender." };

  const phone = phoneValue(formData, "phone");
  if (phone === undefined) return { ok: false, error: PHONE_HINT };

  const dob = text(formData, "dateOfBirth");
  const dateOfBirth = dob ? new Date(`${dob}T00:00:00Z`) : null;
  if (dateOfBirth && (isNaN(dateOfBirth.getTime()) || dateOfBirth > new Date())) {
    return { ok: false, error: "Enter a valid date of birth." };
  }

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        firstName,
        lastName,
        email,
        phone,
        smsOptIn: checkbox(formData, "smsOptIn"),
        dateOfBirth,
        gender,
        address: text(formData, "address"),
        city: text(formData, "city"),
        state: text(formData, "state"),
        country: text(formData, "country"),
        zipCode: text(formData, "zipCode"),
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "That email is already in use." };
    }
    throw e;
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function uploadAvatar(formData: FormData): Promise<ActionResult> {
  const user = await authorize();
  if (!user) return { ok: false, error: "Please sign in again." };

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose an image to upload." };
  const ext = AVATAR_TYPES[file.type];
  if (!ext) return { ok: false, error: "Use a JPG, PNG or WebP image." };
  if (file.size > MAX_AVATAR_BYTES) return { ok: false, error: "Image must be 2 MB or smaller." };

  const avatarUrl = await saveAvatar(`${user.id}-${Date.now()}.${ext}`, file);

  await prisma.user.update({ where: { id: user.id }, data: { avatarUrl } });

  // Drop the previous upload only once the new one is recorded, so a failure here cannot
  // leave the user pointing at a file we already removed.
  await deleteAvatar(user.avatarUrl);

  revalidatePath("/", "layout");
  return { ok: true };
}
