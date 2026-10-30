import "server-only";

import { Prisma, Role, type CheckoutChannel, type Fulfilment, type MobileWallet, type PharmacyOrder, type PharmacyOrderStatus, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { PORTAL_TOKEN, notifyRoles, notifyUsers } from "@/lib/notifications";
import { queueSms } from "@/lib/sms";
import { SMS_BRAND } from "@/lib/sms/templates";
import { platformFeeOf, startPayout } from "@/lib/payouts";
import { formatDate, formatTime } from "@/components/appointments/shared";
import type { OrderRow } from "@/components/pharmacy/shared";

/**
 * The pharmacy shop. Independent pharmacies (each run by a pharmacist) list their own products; a
 * patient fills a cart from one pharmacy and pays for the order online. Stock is taken when the
 * order is paid. The pharmacy sends it out (or has it ready for pickup) and marks it delivered; the
 * patient confirms they have it, or it's confirmed automatically AUTO_CONFIRM_DAYS later. Only then
 * is the pharmacy paid: its share is the order minus the platform fee on the medicines (the delivery
 * fee is all theirs). A paid order cancelled before delivery is refunded in full, and a patient who
 * says it never arrived holds the money until an admin decides.
 */

export const AUTO_CONFIRM_DAYS = 3;
/** Unpaid orders are cancelled after this long, so they don't sit in the pharmacy's list. */
const UNPAID_ORDER_HOURS = 24;

export const describeProduct = (p: { name: string; strength: string | null; form: string | null }) =>
  [p.name, p.strength, p.form].filter(Boolean).join(" ");

export const orderNumber = (n: number) => `ORD-${String(n).padStart(6, "0")}`;

// ---- Placing an order -----------------------------------------------------------------------------

type Checkout = {
  patient: User;
  fulfilment: Fulfilment;
  deliveryAddress: string | null;
  contactPhone: string;
  refundWallet: MobileWallet;
  refundAccount: string;
};

/**
 * Turns the patient's cart into an order and its invoice, and empties the cart. Returns the invoice
 * to pay, or an error to show.
 */
export async function placeOrder(c: Checkout): Promise<{ invoiceId: string } | { error: string }> {
  const cart = await prisma.cartItem.findMany({ where: { userId: c.patient.id }, include: { product: { include: { pharmacy: true } } } });
  if (cart.length === 0) return { error: "Your cart is empty." };
  const pharmacy = cart[0].product.pharmacy;
  if (cart.some((i) => i.product.pharmacyId !== pharmacy.id)) return { error: "Your cart has items from more than one pharmacy. Remove some and try again." };
  if (!pharmacy.isActive) return { error: `${pharmacy.name} isn't taking orders right now.` };
  const unavailable = cart.find((i) => !i.product.isActive || i.product.quantity < i.quantity);
  if (unavailable) {
    const p = unavailable.product;
    return { error: p.isActive && p.quantity > 0 ? `Only ${p.quantity} of ${describeProduct(p)} left. Lower the quantity.` : `${describeProduct(p)} is sold out. Remove it from your cart.` };
  }
  if (c.fulfilment === "DELIVERY" && !pharmacy.deliveryFee) return { error: `${pharmacy.name} doesn't deliver. Choose pickup.` };

  const subtotal = cart.reduce((sum, i) => sum.plus(i.product.price.times(i.quantity)), new Prisma.Decimal(0));
  const deliveryFee = c.fulfilment === "DELIVERY" ? pharmacy.deliveryFee! : new Prisma.Decimal(0);
  const total = subtotal.plus(deliveryFee);
  const platformFee = platformFeeOf(subtotal);

  const invoice = await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.create({
      data: {
        patientId: c.patient.id,
        total,
        notes: `Pharmacy order from ${pharmacy.name}. Refunded in full if cancelled before delivery.`,
        items: {
          create: [
            ...cart.map((i) => ({ description: describeProduct(i.product), quantity: i.quantity, unitPrice: i.product.price })),
            ...(deliveryFee.isPositive() ? [{ description: "Delivery", quantity: 1, unitPrice: deliveryFee }] : []),
          ],
        },
      },
    });
    await tx.pharmacyOrder.create({
      data: {
        patientId: c.patient.id,
        pharmacyId: pharmacy.id,
        invoiceId: invoice.id,
        fulfilment: c.fulfilment,
        deliveryAddress: c.fulfilment === "DELIVERY" ? c.deliveryAddress : null,
        contactPhone: c.contactPhone,
        subtotal,
        deliveryFee,
        total,
        platformFee,
        pharmacyShare: total.minus(platformFee),
        refundWallet: c.refundWallet,
        refundAccount: c.refundAccount,
        items: { create: cart.map((i) => ({ productId: i.productId, name: describeProduct(i.product), unitPrice: i.product.price, quantity: i.quantity })) },
      },
    });
    await tx.cartItem.deleteMany({ where: { userId: c.patient.id } });
    return invoice;
  });
  return { invoiceId: invoice.id };
}

/**
 * Called once an order's invoice is paid in full: takes the stock and tells the pharmacy. If
 * something sold out meanwhile, or the order had been cancelled, the patient is refunded instead.
 * Safe to call more than once.
 */
export async function onPharmacyOrderPaid(invoiceId: string, channel: CheckoutChannel | null): Promise<void> {
  const found = await prisma.pharmacyOrder.findUnique({ where: { invoiceId }, select: { id: true } });
  if (!found) return;

  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "PharmacyOrder" WHERE id = ${found.id} FOR UPDATE`;
    const order = await tx.pharmacyOrder.findUniqueOrThrow({ where: { id: found.id }, include: { items: true } });
    if (order.paidAt) return null;
    const paid = { paidAt: new Date(), paidVia: channel };

    if (order.status !== "AWAITING_PAYMENT") {
      // Cancelled while the patient was paying: the money goes back.
      await tx.pharmacyOrder.update({ where: { id: order.id }, data: paid });
      return "refund" as const;
    }
    for (const item of order.items) {
      const { count } = item.productId
        ? await tx.pharmacyProduct.updateMany({ where: { id: item.productId, isActive: true, quantity: { gte: item.quantity } }, data: { quantity: { decrement: item.quantity } } })
        : { count: 0 };
      if (count === 0) {
        // Nothing taken so far is kept: throwing would undo the payment record too, so put it back by hand.
        for (const taken of order.items.slice(0, order.items.indexOf(item))) {
          await tx.pharmacyProduct.update({ where: { id: taken.productId! }, data: { quantity: { increment: taken.quantity } } });
        }
        await tx.pharmacyOrder.update({
          where: { id: order.id },
          data: { ...paid, status: "CANCELLED", cancelledAt: new Date(), note: `${item.name} sold out before payment went through.` },
        });
        return "refund" as const;
      }
    }
    await tx.pharmacyOrder.update({ where: { id: order.id }, data: { ...paid, status: "PAID" } });
    return "paid" as const;
  });
  if (!outcome) return;

  const order = await loadOrder(found.id);
  if (outcome === "refund") {
    await refundOrder(order);
    await notifyUsers([order.patientId], {
      type: "GENERAL",
      title: "Order cancelled and refunded",
      body: `${orderNumber(order.number)} couldn't be filled: ${order.note ?? "it was cancelled"}. Your payment is being refunded.`,
      link: `/patient/pharmacy/orders/${order.id}`,
    });
    return;
  }
  await notifyUsers([order.pharmacy.ownerId], {
    type: "PAYMENT_RECEIVED",
    title: "New paid order",
    body: `${orderNumber(order.number)} · ${formatMoney(order.total.toString())} · ${order.fulfilment === "DELIVERY" ? `deliver to ${order.deliveryAddress}` : "pickup"}`,
    link: "/staff/pharmacy",
  });
}

const loadOrder = (id: string) => prisma.pharmacyOrder.findUniqueOrThrow({ where: { id }, include: { pharmacy: true, patient: true, items: true } });
type LoadedOrder = Awaited<ReturnType<typeof loadOrder>>;

// ---- Moving an order along -------------------------------------------------------------------------

/** Moves the order from one of `from` to `to`, unless someone else moved it first. */
async function move(id: string, from: PharmacyOrderStatus[], to: PharmacyOrderStatus, data: Prisma.PharmacyOrderUpdateManyMutationInput = {}) {
  const { count } = await prisma.pharmacyOrder.updateMany({ where: { id, status: { in: from } }, data: { ...data, status: to } });
  return count === 1;
}

/** The pharmacy has sent the order out, or has it ready to collect. */
export async function dispatchOrder(order: PharmacyOrder): Promise<boolean> {
  if (!(await move(order.id, ["PAID"], "DISPATCHED", { dispatchedAt: new Date() }))) return false;
  const o = await loadOrder(order.id);
  const text =
    o.fulfilment === "DELIVERY"
      ? `your order ${orderNumber(o.number)} from ${o.pharmacy.name} is on its way.`
      : `your order ${orderNumber(o.number)} is ready to collect at ${o.pharmacy.name}, ${o.pharmacy.address}.`;
  await queueSms({ userId: o.patientId, category: "PHARMACY_ORDER", body: `${SMS_BRAND}: Hi ${o.patient.firstName}, ${text}` });
  await notifyUsers([o.patientId], { type: "GENERAL", title: o.fulfilment === "DELIVERY" ? "Order on its way" : "Order ready to collect", body: text, link: `/patient/pharmacy/orders/${o.id}` });
  return true;
}

/** The pharmacy has handed the order over. The patient confirms, or it's confirmed automatically. */
export async function markDelivered(order: PharmacyOrder): Promise<boolean> {
  if (!(await move(order.id, ["DISPATCHED"], "DELIVERED", { deliveredAt: new Date() }))) return false;
  const o = await loadOrder(order.id);
  const text = `${o.pharmacy.name} says you have order ${orderNumber(o.number)}. Confirm in the app, or report a problem within ${AUTO_CONFIRM_DAYS} days.`;
  await queueSms({ userId: o.patientId, category: "PHARMACY_ORDER", body: `${SMS_BRAND}: Hi ${o.patient.firstName}, ${text}` });
  await notifyUsers([o.patientId], { type: "GENERAL", title: "Did you get your order?", body: text, link: `/patient/pharmacy/orders/${o.id}` });
  return true;
}

/** The patient has the order (or an admin decided they do): the pharmacy is paid. */
export async function confirmReceived(order: PharmacyOrder, from: PharmacyOrderStatus[] = ["DISPATCHED", "DELIVERED"]): Promise<boolean> {
  if (!(await move(order.id, from, "RECEIVED", { receivedAt: new Date() }))) return false;
  await payPharmacy(await loadOrder(order.id));
  return true;
}

/** The patient says the order never arrived: the money is held and admins decide. */
export async function reportNotReceived(order: PharmacyOrder, note: string): Promise<boolean> {
  if (!(await move(order.id, ["DELIVERED"], "DISPUTED", { note }))) return false;
  const o = await loadOrder(order.id);
  const body = `${o.patient.firstName} ${o.patient.lastName} says ${orderNumber(o.number)} from ${o.pharmacy.name} never arrived: "${note}"`;
  await notifyRoles([Role.ADMIN], { type: "GENERAL", title: "Pharmacy order disputed", body, link: "/admin/pharmacies" });
  await notifyUsers([o.pharmacy.ownerId], { type: "GENERAL", title: "Order disputed", body, link: "/staff/pharmacy" });
  return true;
}

/**
 * Cancels an order. An unpaid one just closes (its invoice is voided); a paid one is refunded in full,
 * and its stock goes back on the shelf unless it had already left the pharmacy.
 */
export async function cancelOrder(order: PharmacyOrder, from: PharmacyOrderStatus[], note: string, by: "patient" | "pharmacy" | "admin"): Promise<boolean> {
  if (!(await move(order.id, from, "CANCELLED", { cancelledAt: new Date(), note }))) return false;
  const o = await loadOrder(order.id);
  if (!o.paidAt) {
    await prisma.invoice.updateMany({ where: { id: o.invoiceId, amountPaid: 0 }, data: { status: "VOID" } });
    return true;
  }
  if (order.status === "PAID" || order.status === "DISPATCHED") {
    for (const item of o.items) {
      if (item.productId) await prisma.pharmacyProduct.update({ where: { id: item.productId }, data: { quantity: { increment: item.quantity } } });
    }
  }
  await refundOrder(o);
  const body = `${orderNumber(o.number)} was cancelled${by === "patient" ? " by the patient" : by === "pharmacy" ? ` by ${o.pharmacy.name}` : ""}: ${note}. ${formatMoney(o.total.toString())} is being refunded.`;
  await notifyUsers(by === "patient" ? [o.pharmacy.ownerId] : [o.patientId, o.pharmacy.ownerId], {
    type: "GENERAL",
    title: "Order cancelled",
    body,
    link: by === "patient" ? "/staff/pharmacy" : `/patient/pharmacy/orders/${o.id}`,
  });
  return true;
}

async function refundOrder(o: LoadedOrder) {
  await startPayout({
    orderId: o.id,
    kind: "REFUND",
    recipientId: o.patientId,
    amount: o.total,
    paidVia: o.paidVia,
    wallet: o.refundWallet,
    account: o.refundAccount,
  });
}

async function payPharmacy(o: LoadedOrder) {
  const result = await startPayout({
    orderId: o.id,
    kind: "PHARMACY_SHARE",
    recipientId: o.pharmacy.ownerId,
    amount: o.pharmacyShare,
    paidVia: o.paidVia,
    wallet: o.pharmacy.payoutWallet,
    account: o.pharmacy.payoutAccount,
  });
  if (result === "waiting") {
    await notifyUsers([o.pharmacy.ownerId], {
      type: "PAYMENT_RECEIVED",
      title: "Add your payout number to get paid",
      body: `${formatMoney(o.pharmacyShare.toString())} for ${orderNumber(o.number)} is waiting for you. Add your mobile money number in My Pharmacy and it's sent straight away.`,
      link: "/staff/pharmacy",
    });
  }
}

/** Confirms orders nobody disputed in time, and closes orders never paid. Run from the scheduled job. */
export async function syncPharmacyOrders(): Promise<{ confirmed: number; expired: number }> {
  const [stale, unpaid] = await Promise.all([
    prisma.pharmacyOrder.findMany({ where: { status: "DELIVERED", deliveredAt: { lt: new Date(Date.now() - AUTO_CONFIRM_DAYS * 86400000) } }, take: 50 }),
    prisma.pharmacyOrder.findMany({ where: { status: "AWAITING_PAYMENT", createdAt: { lt: new Date(Date.now() - UNPAID_ORDER_HOURS * 3600000) } }, take: 50 }),
  ]);
  let confirmed = 0;
  for (const o of stale) {
    try {
      if (await confirmReceived(o, ["DELIVERED"])) confirmed++;
    } catch (e) {
      console.error(`Confirming order ${o.id} failed`, e);
    }
  }
  for (const o of unpaid) {
    try {
      await cancelOrder(o, ["AWAITING_PAYMENT"], "not paid in time", "admin");
    } catch (e) {
      console.error(`Closing unpaid order ${o.id} failed`, e);
    }
  }
  return { confirmed, expired: unpaid.length };
}

// ---- Showing orders ---------------------------------------------------------------------------------

export const ORDER_ROW_INCLUDE = { patient: { select: { firstName: true, lastName: true } }, pharmacy: { select: { name: true } }, items: true } as const;
type RowOrder = Prisma.PharmacyOrderGetPayload<{ include: typeof ORDER_ROW_INCLUDE }>;

/** An order as the pharmacy and admin lists show it. */
export const toOrderRow = (o: RowOrder): OrderRow => ({
  id: o.id,
  number: orderNumber(o.number),
  status: o.status,
  fulfilment: o.fulfilment,
  createdAt: `${formatDate(o.createdAt.toISOString())}, ${formatTime(o.createdAt.toISOString())}`,
  patient: `${o.patient.firstName} ${o.patient.lastName}`,
  contactPhone: o.contactPhone,
  deliveryAddress: o.deliveryAddress,
  pharmacy: o.pharmacy.name,
  total: formatMoney(o.total.toString()),
  share: formatMoney(o.pharmacyShare.toString()),
  note: o.note,
  lines: [
    ...o.items.map((i) => ({ name: i.name, quantity: i.quantity, amount: formatMoney(i.unitPrice.times(i.quantity).toString()) })),
    ...(o.deliveryFee.isPositive() ? [{ name: "Delivery", quantity: 1, amount: formatMoney(o.deliveryFee.toString()) }] : []),
  ],
});
