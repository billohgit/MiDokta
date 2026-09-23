import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { displayEmail } from "@/lib/people";
import { formatInvoiceNumber, formatMoney } from "@/lib/money";
import Logo from "@/components/Logo";
import InvoiceActions from "./InvoiceActions";
import { INVOICE_STATUS_CLASS, INVOICE_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "./shared";
import { formatDate, formatTime } from "@/components/appointments/shared";

type Props = {
  id: string;
  basePath: string;
  /** Voiding an invoice is admin-only. */
  canVoid?: boolean;
};

/** One printable invoice, shared by the admin and receptionist portals. */
export default async function InvoiceDetailPage({ id, basePath, canVoid = false }: Props) {
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      patient: true,
      hospital: true,
      appointment: { include: { doctor: { select: { firstName: true, lastName: true } } } },
      items: true,
      payments: { orderBy: { paidAt: "asc" }, include: { receivedBy: { select: { firstName: true, lastName: true } } } },
    },
  });
  if (!invoice) notFound();

  const balance = Number(invoice.total) - Number(invoice.amountPaid);
  const number = formatInvoiceNumber(invoice.number);

  return (
    <div className="settings">
      <div className="no-print invoice-toolbar">
        <Link href={`${basePath}/billing`} className="back-link">
          <i className="fa-solid fa-arrow-left" /> Billing
        </Link>
        <InvoiceActions
          invoiceId={invoice.id}
          number={number}
          balance={balance}
          canPay={invoice.status === "UNPAID" || invoice.status === "PARTIAL"}
          canVoid={canVoid && invoice.status !== "VOID" && invoice.payments.length === 0}
        />
      </div>

      <article className="card invoice-doc print-area">
        <header className="invoice-doc-head">
          <div>
            <Logo tagline />
            {invoice.hospital && (
              <p className="invoice-muted">
                {invoice.hospital.name}
                {invoice.hospital.address && <br />}
                {[invoice.hospital.address, invoice.hospital.city].filter(Boolean).join(", ")}
                {invoice.hospital.phone && <br />}
                {invoice.hospital.phone}
              </p>
            )}
          </div>
          <div className="invoice-doc-meta">
            <h2>INVOICE</h2>
            <p className="invoice-number">{number}</p>
            <span className={`status-pill ${INVOICE_STATUS_CLASS[invoice.status]}`}>{INVOICE_STATUS_LABEL[invoice.status]}</span>
            <dl>
              <dt>Issued</dt>
              <dd>{formatDate(invoice.createdAt.toISOString())}</dd>
              {invoice.dueDate && (
                <>
                  <dt>Due</dt>
                  <dd>{formatDate(`${invoice.dueDate.toISOString().slice(0, 10)}T12:00:00`)}</dd>
                </>
              )}
            </dl>
          </div>
        </header>

        <section className="invoice-parties">
          <div>
            <p className="form-section">Bill to</p>
            <p>
              <Link href={`${basePath}/patients/${invoice.patient.id}`} className="table-link">
                {invoice.patient.firstName} {invoice.patient.lastName}
              </Link>
            </p>
            <p className="invoice-muted">
              {[invoice.patient.phone, displayEmail(invoice.patient.email)].filter(Boolean).join(" · ")}
              {invoice.patient.address && <br />}
              {[invoice.patient.address, invoice.patient.city].filter(Boolean).join(", ")}
            </p>
          </div>
          {invoice.appointment && (
            <div>
              <p className="form-section">For appointment</p>
              <p>{invoice.appointment.title}</p>
              <p className="invoice-muted">
                {formatDate(invoice.appointment.startsAt.toISOString())} at {formatTime(invoice.appointment.startsAt.toISOString())}
                {invoice.appointment.doctor &&
                  ` · Dr. ${invoice.appointment.doctor.firstName} ${invoice.appointment.doctor.lastName}`}
              </p>
            </div>
          )}
        </section>

        <div className="table-wrap">
          <table className="appt-table invoice-table">
            <thead>
              <tr>
                <th>Description</th>
                <th className="num">Qty</th>
                <th className="num">Unit Price</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.description}</td>
                  <td className="num">{item.quantity}</td>
                  <td className="num">{formatMoney(item.unitPrice.toString())}</td>
                  <td className="num">{formatMoney(item.unitPrice.times(item.quantity).toString())}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="invoice-summary">
          <div>
            <span>Total</span>
            <strong>{formatMoney(invoice.total.toString())}</strong>
          </div>
          <div>
            <span>Paid</span>
            <span>{formatMoney(invoice.amountPaid.toString())}</span>
          </div>
          {invoice.status !== "VOID" && (
            <div className="invoice-balance">
              <span>Balance due</span>
              <strong>{formatMoney(balance)}</strong>
            </div>
          )}
        </div>

        {invoice.notes && <p className="invoice-notes">{invoice.notes}</p>}

        <section>
          <p className="form-section">Payments</p>
          {invoice.payments.length === 0 ? (
            <p className="invoice-muted">No payments recorded.</p>
          ) : (
            <div className="table-wrap">
              <table className="appt-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Method</th>
                    <th>Reference</th>
                    <th>Received by</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.payments.map((p) => (
                    <tr key={p.id}>
                      <td>
                        {formatDate(p.paidAt.toISOString())} {formatTime(p.paidAt.toISOString())}
                      </td>
                      <td>{PAYMENT_METHOD_LABEL[p.method]}</td>
                      <td>{p.reference ?? "—"}</td>
                      <td>{p.receivedBy ? `${p.receivedBy.firstName} ${p.receivedBy.lastName}` : "—"}</td>
                      <td className="num">{formatMoney(p.amount.toString())}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </article>
    </div>
  );
}
