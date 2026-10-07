import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { formatInvoiceNumber, formatMoney } from "@/lib/money";
import { paymentsConfigured, syncInvoiceCheckouts } from "@/lib/payments";
import PayButton from "@/components/payments/PayButton";
import { INVOICE_STATUS_CLASS, INVOICE_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "@/components/billing/shared";
import { formatDate } from "@/components/appointments/shared";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ paid?: string; cancelled?: string }> };

/** One of the patient's bills, paid in the app with mobile money or card. */
export default async function PatientInvoicePage({ params, searchParams }: Props) {
  const patient = await requireUser(Role.PATIENT);
  const [{ id }, { paid, cancelled }] = await Promise.all([params, searchParams]);

  const owned = await prisma.invoice.findFirst({ where: { id, patientId: patient.id }, select: { id: true } });
  if (!owned) notFound();
  // Coming back from Monime (or reloading): record any payment that has gone through.
  await syncInvoiceCheckouts(id);

  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id },
    include: {
      hospital: { select: { name: true } },
      items: true,
      payments: { orderBy: { paidAt: "asc" } },
      checkouts: { where: { status: "PENDING" }, select: { id: true } },
    },
  });

  const balance = invoice.total.minus(invoice.amountPaid);
  const open = invoice.status === "UNPAID" || invoice.status === "PARTIAL";

  return (
    <div className="settings">
      <Link href="/patient/billing" className="back-link">
        <i className="fa-solid fa-arrow-left" /> Bills &amp; Payments
      </Link>

      <section className="card my-invoice">
        <header className="my-invoice-head">
          <div>
            <h2 className="section-heading">Invoice {formatInvoiceNumber(invoice.number)}</h2>
            <p className="section-sub">
              {formatDate(invoice.createdAt.toISOString())}
              {invoice.hospital ? ` · ${invoice.hospital.name}` : ""}
              {invoice.dueDate ? ` · due ${formatDate(`${invoice.dueDate.toISOString().slice(0, 10)}T12:00:00`)}` : ""}
            </p>
          </div>
          <span className={`status-pill ${INVOICE_STATUS_CLASS[invoice.status]}`}>{INVOICE_STATUS_LABEL[invoice.status]}</span>
        </header>

        <ul className="pay-items">
          {invoice.items.map((item) => (
            <li key={item.id}>
              <span>
                {item.description}
                {item.quantity > 1 && ` × ${item.quantity}`}
              </span>
              <span>{formatMoney(item.unitPrice.times(item.quantity).toString())}</span>
            </li>
          ))}
          <li className="pay-total">
            <span>Total</span>
            <span>{formatMoney(invoice.total.toString())}</span>
          </li>
          {invoice.payments.map((p) => (
            <li key={p.id}>
              <span>
                Paid {formatDate(p.paidAt.toISOString())} · {PAYMENT_METHOD_LABEL[p.method]}
              </span>
              <span>−{formatMoney(p.amount.toString())}</span>
            </li>
          ))}
        </ul>

        {invoice.status === "VOID" ? (
          <p className="pay-status">This invoice has been cancelled. There is nothing to pay.</p>
        ) : !open ? (
          <p className="pay-status pay-status-ok">
            <i className="fa-solid fa-circle-check" /> {paid ? "Thank you, your payment was received." : "Paid in full."}
          </p>
        ) : (
          <div className="my-invoice-pay">
            <div className="pay-balance">
              <span>Balance due</span>
              <strong>{formatMoney(balance.toString())}</strong>
            </div>
            {paid && invoice.checkouts.length > 0 && (
              <p className="pay-status">We&apos;re confirming your payment. This can take a minute: refresh this page shortly.</p>
            )}
            {cancelled && <p className="pay-status">The payment was cancelled. You can try again below.</p>}
            {paymentsConfigured() ? (
              <>
                <PayButton invoiceId={invoice.id} label={`Pay ${formatMoney(balance.toString())}`} />
                <p className="pay-methods">
                  <i className="fa-solid fa-mobile-screen" /> Orange Money · Afrimoney · <i className="fa-regular fa-credit-card" /> Card
                </p>
              </>
            ) : (
              <p className="pay-status">Online payment isn&apos;t available right now. Please pay at the clinic.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
