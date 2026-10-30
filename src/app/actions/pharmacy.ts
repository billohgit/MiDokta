"use server";

import { revalidatePath } from "next/cache";
import { Fulfilment, MobileWallet, Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/auth";
import { type ActionResult, DENIED, enumValue, fail, intValue, phoneValue, PHONE_HINT, text } from "@/lib/form";
import { channelsRefundableTo, sendWaitingPayouts, walletAccount } from "@/lib/payouts";
import { cancelOrder, confirmReceived, dispatchOrder, markDelivered, placeOrder, reportNotReceived } from "@/lib/pharmacy";

const MONEY = /^\d+(\.\d{1,2})?$/;
const MAX_PRICE = 1_000_000;
const MAX_QUANTITY = 100_000;
const MAX_IN_CART = 99;
const refresh = () => revalidatePath("/", "layout");

const money = (formData: FormData, key: string) => {
  const value = text(formData, key);
  if (value === null) return null;
  return MONEY.test(value) && Number(value) <= MAX_PRICE ? new Prisma.Decimal(value) : undefined;
};

// ---- Patients: cart and orders -------------------------------------------------------------------

/**
 * Adds a product to the patient's cart (or sets its quantity). A cart holds one pharmacy's products:
 * adding from another returns `otherPharmacy`, and calling again with `replaceCart` empties it first.
 */
export async function addToCart(productId: string, quantity: number, replaceCart = false): Promise<ActionResult & { otherPharmacy?: string }> {
  const me = await authorize(Role.PATIENT);
  if (!me) return DENIED;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_IN_CART) return fail(`Choose a quantity from 1 to ${MAX_IN_CART}.`);

  const product = await prisma.pharmacyProduct.findFirst({ where: { id: productId, isActive: true, pharmacy: { isActive: true } }, include: { pharmacy: true } });
  if (!product) return fail("That product isn't available any more.");

  const other = await prisma.cartItem.findFirst({ where: { userId: me.id, product: { pharmacyId: { not: product.pharmacyId } } }, include: { product: { include: { pharmacy: true } } } });
  if (other && !replaceCart) return { ok: false, error: `Your cart has items from ${other.product.pharmacy.name}.`, otherPharmacy: other.product.pharmacy.name };
  if (other) await prisma.cartItem.deleteMany({ where: { userId: me.id } });

  const existing = await prisma.cartItem.findUnique({ where: { userId_productId: { userId: me.id, productId } } });
  const wanted = Math.min((existing?.quantity ?? 0) + quantity, MAX_IN_CART);
  if (wanted > product.quantity) return fail(product.quantity === 0 ? "Sold out." : `Only ${product.quantity} left.`);
  await prisma.cartItem.upsert({
    where: { userId_productId: { userId: me.id, productId } },
    create: { userId: me.id, productId, quantity: wanted },
    update: { quantity: wanted },
  });
  refresh();
  return { ok: true };
}

/** Changes a cart line's quantity; 0 removes it. */
export async function setCartQuantity(productId: string, quantity: number): Promise<ActionResult> {
  const me = await authorize(Role.PATIENT);
  if (!me) return DENIED;
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_IN_CART) return fail(`Choose a quantity from 1 to ${MAX_IN_CART}.`);
  if (quantity === 0) {
    await prisma.cartItem.deleteMany({ where: { userId: me.id, productId } });
  } else {
    const product = await prisma.pharmacyProduct.findUnique({ where: { id: productId } });
    if (product && quantity > product.quantity) return fail(product.quantity === 0 ? "Sold out." : `Only ${product.quantity} left.`);
    await prisma.cartItem.updateMany({ where: { userId: me.id, productId }, data: { quantity } });
  }
  refresh();
  return { ok: true };
}

/** Places the order for what's in the cart. Returns the invoice to pay as `payInvoiceId`. */
export async function checkout(formData: FormData): Promise<ActionResult & { payInvoiceId?: string }> {
  const me = await authorize(Role.PATIENT);
  if (!me) return DENIED;

  const fulfilment = enumValue(formData, "fulfilment", Object.values(Fulfilment));
  if (!fulfilment) return fail("Choose delivery or pickup.");
  const deliveryAddress = text(formData, "deliveryAddress")?.slice(0, 300) ?? null;
  if (fulfilment === "DELIVERY" && !deliveryAddress) return fail("Enter the delivery address.");
  const contactPhone = phoneValue(formData, "contactPhone");
  if (!contactPhone) return fail(PHONE_HINT);

  const refundWallet = enumValue(formData, "refundWallet", Object.values(MobileWallet));
  if (!refundWallet) return fail("Choose where a refund should go.");
  const refundAccount = walletAccount(refundWallet, text(formData, "refundAccount"));
  if (!refundAccount) return fail(refundWallet === "TENKIPAY" ? "Enter your TenkiPay wallet number." : "Enter a valid Sierra Leone mobile number for refunds.");
  if (channelsRefundableTo(refundWallet).length === 0) return fail("Online payment isn't available for that refund account right now. Choose another.");

  const result = await placeOrder({ patient: me, fulfilment, deliveryAddress, contactPhone, refundWallet, refundAccount });
  if ("error" in result) return fail(result.error);
  refresh();
  return { ok: true, payInvoiceId: result.invoiceId };
}

async function myOrder(id: string) {
  const me = await authorize(Role.PATIENT);
  return me ? prisma.pharmacyOrder.findFirst({ where: { id, patientId: me.id } }) : null;
}

/** A patient cancels an order the pharmacy hasn't sent out yet; a paid one is refunded in full. */
export async function cancelMyOrder(id: string): Promise<ActionResult> {
  const order = await myOrder(id);
  if (!order) return fail("Order not found.");
  if (!(await cancelOrder(order, ["AWAITING_PAYMENT", "PAID"], "cancelled by the patient", "patient"))) {
    return fail("This order can't be cancelled now: it has already left the pharmacy.");
  }
  refresh();
  return { ok: true };
}

/** The patient has their order: the pharmacy gets paid. */
export async function confirmMyOrder(id: string): Promise<ActionResult> {
  const order = await myOrder(id);
  if (!order) return fail("Order not found.");
  if (!(await confirmReceived(order))) return fail("This order can't be confirmed now.");
  refresh();
  return { ok: true };
}

/** The patient says a delivered order never arrived. */
export async function reportMyOrder(id: string, note: string): Promise<ActionResult> {
  const order = await myOrder(id);
  if (!order) return fail("Order not found.");
  const what = note.trim().slice(0, 500);
  if (!what) return fail("Tell us what went wrong.");
  if (!(await reportNotReceived(order, what))) return fail("You can report a problem only after the pharmacy marks the order delivered.");
  refresh();
  return { ok: true };
}

// ---- Pharmacies: their shop, products and orders ---------------------------------------------------

/** A pharmacist sets up (or edits) their pharmacy, including where they're paid. */
export async function savePharmacy(formData: FormData): Promise<ActionResult> {
  const me = await authorize(Role.PHARMACIST);
  if (!me) return DENIED;

  const name = text(formData, "name")?.slice(0, 120);
  const address = text(formData, "address")?.slice(0, 300);
  if (!name || !address) return fail("Name and address are required.");
  const phone = phoneValue(formData, "phone");
  if (phone === undefined) return fail(PHONE_HINT);
  const deliveryFee = money(formData, "deliveryFee");
  if (deliveryFee === undefined) return fail("Enter a valid delivery fee (up to 2 decimal places), or leave it empty for pickup only.");

  const payoutWallet = enumValue(formData, "payoutWallet", Object.values(MobileWallet));
  if (payoutWallet === undefined) return fail("Choose where you want to be paid.");
  const payoutAccount = payoutWallet ? walletAccount(payoutWallet, text(formData, "payoutAccount")) : null;
  if (payoutWallet && !payoutAccount) return fail(payoutWallet === "TENKIPAY" ? "Enter your TenkiPay wallet number." : "Enter a valid Sierra Leone mobile number.");

  const data = { name, address, city: text(formData, "city")?.slice(0, 80) ?? null, phone, deliveryFee, payoutWallet, payoutAccount };
  await prisma.pharmacy.upsert({ where: { ownerId: me.id }, create: { ...data, ownerId: me.id }, update: data });
  await sendWaitingPayouts(me.id, "PHARMACY_SHARE", payoutWallet, payoutAccount);
  refresh();
  return { ok: true };
}

const myPharmacy = (ownerId: string) => prisma.pharmacy.findUnique({ where: { ownerId } });

/** Adds a product to the pharmacist's shop, or edits one (when `id` is set). */
export async function saveProduct(formData: FormData): Promise<ActionResult> {
  const me = await authorize(Role.PHARMACIST);
  if (!me) return DENIED;
  const pharmacy = await myPharmacy(me.id);
  if (!pharmacy) return fail("Set up your pharmacy first.");

  const name = text(formData, "name")?.slice(0, 120);
  if (!name) return fail("Enter the product name.");
  const price = money(formData, "price");
  if (!price || !price.isPositive()) return fail("Enter a price above 0 (up to 2 decimal places).");
  const quantity = intValue(formData, "quantity", 0, MAX_QUANTITY);
  if (quantity === undefined || quantity === null) return fail(`Enter the stock on hand, from 0 to ${MAX_QUANTITY.toLocaleString()}.`);

  const data = {
    name,
    strength: text(formData, "strength")?.slice(0, 40) ?? null,
    form: text(formData, "form")?.slice(0, 40) ?? null,
    description: text(formData, "description")?.slice(0, 500) ?? null,
    price,
    quantity,
  };
  const id = text(formData, "id");
  if (id) {
    const { count } = await prisma.pharmacyProduct.updateMany({ where: { id, pharmacyId: pharmacy.id }, data });
    if (count === 0) return fail("Product not found.");
  } else {
    await prisma.pharmacyProduct.create({ data: { ...data, pharmacyId: pharmacy.id } });
  }
  refresh();
  return { ok: true };
}

/** Shows or hides a product in the shop. */
export async function setProductActive(id: string, isActive: boolean): Promise<ActionResult> {
  const me = await authorize(Role.PHARMACIST);
  if (!me) return DENIED;
  const { count } = await prisma.pharmacyProduct.updateMany({ where: { id, pharmacy: { ownerId: me.id } }, data: { isActive } });
  if (count === 0) return fail("Product not found.");
  if (!isActive) await prisma.cartItem.deleteMany({ where: { productId: id } });
  refresh();
  return { ok: true };
}

/** A pharmacy moves one of its orders along: sent out / ready, handed over, or cancelled (refunded). */
export async function updatePharmacyOrder(id: string, action: "dispatch" | "deliver" | "cancel", note?: string): Promise<ActionResult> {
  const me = await authorize(Role.PHARMACIST);
  if (!me) return DENIED;
  const order = await prisma.pharmacyOrder.findFirst({ where: { id, pharmacy: { ownerId: me.id } } });
  if (!order) return fail("Order not found.");

  const done =
    action === "dispatch"
      ? await dispatchOrder(order)
      : action === "deliver"
        ? await markDelivered(order)
        : await cancelOrder(order, ["PAID", "DISPATCHED"], note?.trim().slice(0, 300) || "cancelled by the pharmacy", "pharmacy");
  if (!done) return fail("This order has moved on since you opened it. Refresh and try again.");
  refresh();
  return { ok: true };
}

// ---- Admins -------------------------------------------------------------------------------------

/** Takes a pharmacy off the shop, or puts it back. Its open orders carry on. */
export async function setPharmacyActive(id: string, isActive: boolean): Promise<ActionResult> {
  if (!(await authorize(Role.ADMIN))) return DENIED;
  await prisma.pharmacy.update({ where: { id }, data: { isActive } });
  if (!isActive) await prisma.cartItem.deleteMany({ where: { product: { pharmacyId: id } } });
  refresh();
  return { ok: true };
}

/** Settles a disputed order: either the patient had it (pay the pharmacy) or they didn't (refund them). */
export async function resolveDispute(id: string, outcome: "pay" | "refund"): Promise<ActionResult> {
  if (!(await authorize(Role.ADMIN))) return DENIED;
  const order = await prisma.pharmacyOrder.findUnique({ where: { id } });
  if (!order) return fail("Order not found.");
  const done =
    outcome === "pay" ? await confirmReceived(order, ["DISPUTED"]) : await cancelOrder(order, ["DISPUTED"], "not received (decided by MiDokta)", "admin");
  if (!done) return fail("This order isn't disputed any more.");
  refresh();
  return { ok: true };
}
