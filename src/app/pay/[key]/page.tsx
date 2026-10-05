import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { formatInvoiceNumber, formatMoney } from "@/lib/money";
import { paymentsConfigured, syncInvoiceCheckouts } from "@/lib/payments";
import Logo from "@/components/Logo";
import PayButton from "@/components/payments/PayButton";

export const dynamic = "force-dynamic";

// The key in this URL is the patient's only credential: keep it out of search engines and referrers.
export const metadata: Metadata = {
  title: "Pay invoice | Mi Dokta",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Props = { params: Promise<{ key: string }>; searchParams: Promise<{ paid?: string; cancelled?: string }> };

/** Where a patient pays an invoice from the texted link. No sign-in: the key is the pass. */
export default async function PayInvoicePage({ params, searchParams }: Props) {
  const { key } = await params;
  const { paid, cancelled } = await searchParams;

  const found = await prisma.invoice.findUnique({ where: { payKey: key }, select: { id: true } });
  // Coming back from Monime (or reloading): record any payment that has gone through.
  if (found) await syncInvoiceCheckouts(found.id);

  const invoice = found
    ? await prisma.invoice.findUnique({
        where: { id: found.id },
        include: {
          patient: { select: { firstName: true } },
          hospital: { select: { name: true } },
          items: true,
          checkouts: { where: { status: "PENDING" }, select: { id: true } },
        },
      })
    : null;

  if (!invoice) {
    return (
      <PayShell>
        <h1>Link not valid</h1>
        <p className="login-sub">This payment link isn&apos;t valid. Check the text message, or contact the clinic.</p>
      </PayShell>
    );
  }

  const balance = invoice.total.minus(invoice.amountPaid);
  const open = invoice.status === "UNPAID" || invoice.status === "PARTIAL";
  const number = formatInvoiceNumber(invoice.number);

  return (
    <PayShell>
      <h1>Invoice {number}</h1>
      <p className="login-sub">
        For {invoice.patient.firstName}
        {invoice.hospital ? ` · ${invoice.hospital.name}` : ""}
      </p>

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
        {!invoice.amountPaid.isZero() && (
          <li>
            <span>Paid</span>
            <span>{formatMoney(invoice.amountPaid.toString())}</span>
          </li>
        )}
      </ul>

      {invoice.status === "VOID" ? (
        <p className="pay-status">This invoice has been cancelled. There is nothing to pay.</p>
      ) : !open ? (
        <p className="pay-status pay-status-ok">
          <i className="fa-solid fa-circle-check" /> {paid ? "Thank you, your payment was received." : "This invoice is paid in full."}
        </p>
      ) : (
        <>
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
              <PayButton payKey={key} label={`Pay ${formatMoney(balance.toString())}`} />
              <p className="pay-methods">
                <i className="fa-solid fa-mobile-screen" /> Orange Money · Afrimoney · <i className="fa-regular fa-credit-card" /> Card
              </p>
            </>
          ) : (
            <p className="pay-status">Online payment isn&apos;t available right now. Please pay at the clinic.</p>
          )}
        </>
      )}
    </PayShell>
  );
}

function PayShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="login-page">
      <div className="card login-card pay-card">
        <div className="login-brand">
          <Logo stacked tagline />
        </div>
        {children}
      </div>
    </main>
  );
}
