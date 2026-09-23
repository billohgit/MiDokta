"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { InvoiceStatus } from "@prisma/client";
import Avatar from "@/components/appointments/Avatar";
import { formatDate, fullName, type Person } from "@/components/appointments/shared";
import { formatInvoiceNumber, formatMoney } from "@/lib/money";
import { INVOICE_STATUS_CLASS, INVOICE_STATUS_LABEL } from "./shared";

export type InvoiceRow = {
  id: string;
  number: number;
  patient: Person;
  createdAt: string;
  dueDate: string | null;
  total: number;
  amountPaid: number;
  status: InvoiceStatus;
};

const FILTERS: ("ALL" | InvoiceStatus)[] = ["ALL", "UNPAID", "PARTIAL", "PAID", "VOID"];

/** `basePath` is the portal these links belong to, e.g. "/admin". */
export default function InvoicesView({ invoices, basePath }: { invoices: InvoiceRow[]; basePath: string }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | InvoiceStatus>("ALL");
  const today = new Date().toISOString().slice(0, 10);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices.filter(
      (i) =>
        (status === "ALL" || i.status === status) &&
        (!q || formatInvoiceNumber(i.number).toLowerCase().includes(q) || fullName(i.patient).toLowerCase().includes(q))
    );
  }, [invoices, query, status]);

  return (
    <div>
      <div className="appt-header">
        <h2 className="section-heading">Invoices</h2>
        <div className="appt-header-actions">
          <label className="search">
            <i className="fa-solid fa-magnifying-glass" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Invoice # or patient..." />
          </label>
          <Link href={`${basePath}/billing/new`} className="btn btn-primary btn-lg">
            <i className="fa-solid fa-plus btn-icon" /> New Invoice
          </Link>
        </div>
      </div>

      <div className="all-header">
        <div className="segmented" role="tablist">
          {FILTERS.map((f) => (
            <button key={f} role="tab" aria-selected={status === f} className={status === f ? "on" : ""} onClick={() => setStatus(f)}>
              {f === "ALL" ? "All" : INVOICE_STATUS_LABEL[f]} ({f === "ALL" ? invoices.length : invoices.filter((i) => i.status === f).length})
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="empty-banner">No invoices found.</div>
      ) : (
        <div className="card table-wrap">
          <table className="appt-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Patient</th>
                <th>Date</th>
                <th>Due</th>
                <th className="num">Total</th>
                <th className="num">Paid</th>
                <th className="num">Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((i) => {
                const balance = i.total - i.amountPaid;
                const overdue = i.dueDate && i.dueDate < today && (i.status === "UNPAID" || i.status === "PARTIAL");
                return (
                  <tr key={i.id}>
                    <td>
                      <Link href={`${basePath}/billing/${i.id}`} className="table-link">
                        {formatInvoiceNumber(i.number)}
                      </Link>
                    </td>
                    <td>
                      <Link href={`${basePath}/patients/${i.patient.id}`} className="person-cell">
                        <Avatar person={i.patient} size={32} />
                        <span>{fullName(i.patient)}</span>
                      </Link>
                    </td>
                    <td>{formatDate(i.createdAt)}</td>
                    <td className={overdue ? "overdue" : undefined}>
                      {i.dueDate ? formatDate(`${i.dueDate}T12:00:00`) : "—"}
                      {overdue && " (overdue)"}
                    </td>
                    <td className="num">{formatMoney(i.total)}</td>
                    <td className="num">{formatMoney(i.amountPaid)}</td>
                    <td className="num">{i.status === "VOID" ? "—" : formatMoney(balance)}</td>
                    <td>
                      <span className={`status-pill ${INVOICE_STATUS_CLASS[i.status]}`}>{INVOICE_STATUS_LABEL[i.status]}</span>
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
