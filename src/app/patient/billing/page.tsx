import Link from "next/link";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { formatInvoiceNumber, formatMoney } from "@/lib/money";
import { INVOICE_STATUS_CLASS, INVOICE_STATUS_LABEL } from "@/components/billing/shared";
import { formatDate } from "@/components/appointments/shared";

export const dynamic = "force-dynamic";

export default async function PatientBillingPage() {
  const patient = await requireUser(Role.PATIENT);
  const invoices = await prisma.invoice.findMany({
    where: { patientId: patient.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const due = invoices
    .filter((i) => i.status === "UNPAID" || i.status === "PARTIAL")
    .reduce((sum, i) => sum + Number(i.total) - Number(i.amountPaid), 0);

  return (
    <div className="settings">
      <div className="appt-header">
        <div>
          <h2 className="section-heading">Bills &amp; Payments</h2>
          <p className="section-sub">{due > 0 ? `${formatMoney(due)} to pay` : "Nothing to pay right now"}</p>
        </div>
      </div>

      {invoices.length === 0 ? (
        <div className="empty-banner">No bills yet.</div>
      ) : (
        <div className="card table-wrap">
          <table className="appt-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Date</th>
                <th>Total</th>
                <th>Balance</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => {
                const balance = Number(i.total) - Number(i.amountPaid);
                const open = i.status === "UNPAID" || i.status === "PARTIAL";
                return (
                  <tr key={i.id}>
                    <td>
                      <Link href={`/patient/billing/${i.id}`} className="table-link">
                        {formatInvoiceNumber(i.number)}
                      </Link>
                    </td>
                    <td>{formatDate(i.createdAt.toISOString())}</td>
                    <td className="num">{formatMoney(i.total.toString())}</td>
                    <td className="num">{open ? formatMoney(balance) : "—"}</td>
                    <td>
                      <span className={`status-pill ${INVOICE_STATUS_CLASS[i.status]}`}>{INVOICE_STATUS_LABEL[i.status]}</span>
                    </td>
                    <td>
                      <Link href={`/patient/billing/${i.id}`} className={`btn btn-sm ${open ? "btn-success" : "btn-outline"}`}>
                        {open ? "Pay" : "View"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
