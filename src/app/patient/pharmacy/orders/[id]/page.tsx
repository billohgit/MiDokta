import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { AUTO_CONFIRM_DAYS, orderNumber } from "@/lib/pharmacy";
import { syncInvoiceCheckouts } from "@/lib/payments";
import { WALLET_LABEL } from "@/lib/payouts";
import { formatDate, formatTime } from "@/components/appointments/shared";
import { ORDER_STATUS_CLASS, statusLabel } from "@/components/pharmacy/shared";
import OrderActions from "@/components/pharmacy/OrderActions";
import PharmacyDistance from "@/components/pharmacy/PharmacyDistance";

export const dynamic = "force-dynamic";

const at = (d: Date) => `${formatDate(d.toISOString())}, ${formatTime(d.toISOString())}`;

export default async function MyOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const patient = await requireUser(Role.PATIENT);
  const { id } = await params;
  const owned = await prisma.pharmacyOrder.findFirst({ where: { id, patientId: patient.id }, select: { invoiceId: true } });
  if (!owned) notFound();
  // Coming back from the checkout (or reloading): record a payment that has gone through.
  await syncInvoiceCheckouts(owned.invoiceId);

  const o = await prisma.pharmacyOrder.findUniqueOrThrow({
    where: { id },
    include: { pharmacy: true, items: true, payouts: { where: { kind: "REFUND" } } },
  });
  const refund = o.payouts[0];
  const pickup = o.fulfilment === "PICKUP";

  const steps: [string, Date | null][] = [
    ["Ordered", o.createdAt],
    ["Paid", o.paidAt],
    [pickup ? "Ready to collect" : "Sent out", o.dispatchedAt],
    [pickup ? "Collected" : "Delivered", o.deliveredAt],
    ["Confirmed", o.receivedAt],
  ];

  return (
    <div className="settings">
      <Link href="/patient/pharmacy/orders" className="back-link">
        <i className="fa-solid fa-arrow-left" /> My Orders
      </Link>

      <section className="card my-invoice">
        <header className="my-invoice-head">
          <div>
            <h2 className="section-heading">Order {orderNumber(o.number)}</h2>
            <p className="section-sub">
              {o.pharmacy.name} · {o.pharmacy.address}
              {o.pharmacy.phone && ` · ${o.pharmacy.phone}`}
              <br />
              <PharmacyDistance
                to={o.pharmacy.latitude != null && o.pharmacy.longitude != null ? { lat: o.pharmacy.latitude, lng: o.pharmacy.longitude } : null}
              />
            </p>
          </div>
          <span className={`status-pill ${ORDER_STATUS_CLASS[o.status]}`}>{statusLabel(o.status, o.fulfilment)}</span>
        </header>

        {o.status === "CANCELLED" ? (
          <p className="pay-status">
            Cancelled{o.note ? `: ${o.note}` : ""}.{" "}
            {o.paidAt &&
              (refund?.status === "COMPLETED"
                ? `Refunded in full to your ${WALLET_LABEL[refund.wallet!]} ${refund.account}.`
                : refund?.status === "FAILED"
                  ? "Your refund couldn't be sent automatically. MiDokta has been told and will send it to you."
                  : `Your refund of ${formatMoney(o.total.toString())} is on its way to your ${WALLET_LABEL[o.refundWallet]} ${o.refundAccount}.`)}
          </p>
        ) : (
          <ol className="order-steps">
            {steps.map(([label, when]) => (
              <li key={label} className={when ? "done" : undefined}>
                <i className={`fa-solid ${when ? "fa-circle-check" : "fa-circle"}`} /> {label}
                {when && <span className="section-sub"> · {at(when)}</span>}
              </li>
            ))}
          </ol>
        )}
        {o.status === "DISPUTED" && <p className="pay-status">You reported: &ldquo;{o.note}&rdquo;. MiDokta will look into it and contact you.</p>}

        <ul className="pay-items">
          {o.items.map((i) => (
            <li key={i.id}>
              <span>
                {i.name}
                {i.quantity > 1 && ` × ${i.quantity}`}
              </span>
              <span>{formatMoney(i.unitPrice.times(i.quantity).toString())}</span>
            </li>
          ))}
          {o.deliveryFee.isPositive() && (
            <li>
              <span>Delivery</span>
              <span>{formatMoney(o.deliveryFee.toString())}</span>
            </li>
          )}
          <li className="pay-total">
            <span>Total</span>
            <span>{formatMoney(o.total.toString())}</span>
          </li>
        </ul>
        <p className="form-note">
          {pickup ? "Pickup at the pharmacy." : `Delivery to ${o.deliveryAddress}.`} The pharmacy will call {o.contactPhone} if needed.
        </p>

        <OrderActions id={o.id} invoiceId={o.invoiceId} status={o.status} fulfilment={o.fulfilment} autoConfirmDays={AUTO_CONFIRM_DAYS} />
      </section>
    </div>
  );
}
