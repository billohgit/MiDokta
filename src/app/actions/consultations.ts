"use server";

import { revalidatePath } from "next/cache";
import { MobileWallet, Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/auth";
import { type ActionResult, DENIED, decimalValue, enumValue, fail, text } from "@/lib/form";
import { sendWaitingPayouts, walletAccount } from "@/lib/payouts";

const MAX_FEE = 100_000;

/** A doctor sets their consultation fee and where their share of it is paid. */
export async function saveConsultationSettings(formData: FormData): Promise<ActionResult> {
  const me = await authorize(Role.DOCTOR);
  if (!me) return DENIED;

  const fee = decimalValue(formData, "consultationFee", 0, MAX_FEE);
  if (fee === undefined || (fee && !/^\d+(\.\d{1,2})?$/.test(fee))) return fail(`Enter a fee from 0 to ${MAX_FEE.toLocaleString()}, with up to 2 decimal places.`);

  const payoutWallet = enumValue(formData, "payoutWallet", Object.values(MobileWallet));
  if (payoutWallet === undefined) return fail("Choose where you want to be paid.");
  const raw = text(formData, "payoutAccount");
  const payoutAccount = payoutWallet ? walletAccount(payoutWallet, raw) : null;
  if (payoutWallet && !payoutAccount) {
    return fail(payoutWallet === "TENKIPAY" ? "Enter your TenkiPay wallet number." : "Enter a valid Sierra Leone mobile number.");
  }
  if (fee && Number(fee) > 0 && !payoutWallet) return fail("Add the mobile money number your fees should be paid to.");

  const doctor = await prisma.user.update({
    where: { id: me.id },
    data: { consultationFee: fee ? new Prisma.Decimal(fee) : null, payoutWallet, payoutAccount },
  });
  await sendWaitingPayouts(doctor.id, "DOCTOR_SHARE", doctor.payoutWallet, doctor.payoutAccount);

  revalidatePath("/", "layout");
  return { ok: true };
}
