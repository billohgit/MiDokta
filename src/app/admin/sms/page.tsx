import Link from "next/link";
import { type SmsStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSmsProvider } from "@/lib/sms/providers";
import { allowlistSize } from "@/lib/sms/allowlist";
import StatCard from "@/components/StatCard";
import SmsLogActions from "@/components/sms/SmsLogActions";
import { formatDate, formatTime } from "@/components/appointments/shared";

export const dynamic = "force-dynamic";

const STATUSES: SmsStatus[] = ["SENT", "PENDING", "FAILED", "SKIPPED"];
const STATUS_CLASS: Record<SmsStatus, string> = {
  SENT: "status-confirmed",
  PENDING: "status-pending",
  FAILED: "status-rejected",
  SKIPPED: "status-void",
};
const PAGE_SIZE = 25;

const categoryLabel = (c: string) => c.charAt(0) + c.slice(1).toLowerCase().replaceAll("_", " ");

type Props = { searchParams: Promise<{ status?: string; page?: string }> };

export default async function AdminSmsPage({ searchParams }: Props) {
  const params = await searchParams;
  const status = STATUSES.includes(params.status as SmsStatus) ? (params.status as SmsStatus) : undefined;
  const page = Math.max(1, Number(params.page) || 1);

  const provider = getSmsProvider();
  const allowlist = allowlistSize();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [counts, messages, total] = await Promise.all([
    prisma.smsMessage.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.smsMessage.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, role: true } },
        sentBy: { select: { firstName: true, lastName: true } },
        message: { select: { conversationId: true } },
      },
    }),
    prisma.smsMessage.count({ where: status ? { status } : {} }),
  ]);

  const count = (s: SmsStatus) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (next: { status?: string; page?: number }) => {
    const q = new URLSearchParams();
    const st = "status" in next ? next.status : status;
    if (st) q.set("status", st);
    if ((next.page ?? 1) > 1) q.set("page", String(next.page));
    return `/admin/sms${q.size ? `?${q}` : ""}`;
  };

  return (
    <div>
      <div className="appt-header">
        <div>
          <h2 className="section-heading">SMS</h2>
          <p className="section-sub">
            Provider: <strong>{provider.name}</strong>
            {provider.live ? " · live" : " · messages are logged, not sent"}
            {provider.live && (provider.twoWay ? " · replies come back" : " · send-only, no replies")}
          </p>
        </div>
        <SmsLogActions mode="run-scheduled" />
      </div>

      {!provider.live && (
        <p className="form-warning page-error">
          <i className="fa-solid fa-triangle-exclamation" /> SMS is in development mode. Set <code>SMS_PROVIDER</code> to{" "}
          <code>smsgate</code>, <code>twilio</code> or <code>africastalking</code> with its credentials in{" "}
          <code>.env</code> to text real phones.
        </p>
      )}

      {allowlist > 0 && (
        <p className="form-warning page-error">
          <i className="fa-solid fa-flask" /> Test mode: only the {allowlist} number
          {allowlist === 1 ? "" : "s"} in <code>SMS_ALLOWED_NUMBERS</code> will be texted. Everyone else is logged as
          skipped. Clear that setting in <code>.env</code> to text everyone.
        </p>
      )}

      <section className="stats">
        <StatCard label={provider.live ? "Sent (24h)" : "Logged (24h)"} value={count("SENT")} icon="fa-paper-plane" />
        <StatCard label="Pending (24h)" value={count("PENDING")} icon="fa-hourglass-half" />
        <StatCard label="Failed (24h)" value={count("FAILED")} icon="fa-triangle-exclamation" />
        <StatCard label="Skipped (24h)" value={count("SKIPPED")} icon="fa-ban" />
      </section>

      <p className="sms-info">
        <i className="fa-solid fa-circle-info" /> To text patients or staff, open{" "}
        <Link href="/admin/chat" className="table-link">
          Chat
        </Link>{" "}
        and message them there. People who can&apos;t sign in receive chat messages by SMS.{" "}
        {provider.twoWay
          ? "Their text replies come back into the same conversation."
          : "This provider is send-only, so replies won't come back."}
      </p>

      <div className="all-header">
        <h2 className="section-heading">Message Log</h2>
        <div className="segmented" role="tablist">
          <Link href={href({ status: undefined })} className={!status ? "on" : ""} role="tab" aria-selected={!status}>
            All
          </Link>
          {STATUSES.map((s) => (
            <Link key={s} href={href({ status: s })} className={status === s ? "on" : ""} role="tab" aria-selected={status === s}>
              {categoryLabel(s)}
            </Link>
          ))}
        </div>
      </div>

      {messages.length === 0 ? (
        <div className="empty-banner">No messages yet.</div>
      ) : (
        <div className="card table-wrap">
          <table className="appt-table sms-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Person</th>
                <th>Type</th>
                <th>Message</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => (
                <tr key={m.id}>
                  <td>
                    {formatDate(m.createdAt.toISOString())}
                    <br />
                    <small className="section-sub">{formatTime(m.createdAt.toISOString())}</small>
                  </td>
                  <td>
                    {m.user ? (
                      m.user.role === Role.PATIENT ? (
                        <Link href={`/admin/patients/${m.user.id}`} className="table-link">
                          {m.user.firstName} {m.user.lastName}
                        </Link>
                      ) : (
                        `${m.user.firstName} ${m.user.lastName}`
                      )
                    ) : (
                      "Deleted user"
                    )}
                    <br />
                    <small className="section-sub">{m.to ?? "no number"}</small>
                  </td>
                  <td>
                    <span className={`sms-direction ${m.direction === "INBOUND" ? "in" : "out"}`}>
                      <i className={`fa-solid ${m.direction === "INBOUND" ? "fa-arrow-down" : "fa-arrow-up"}`} />{" "}
                      {m.direction === "INBOUND" ? "Received" : "Sent"}
                    </span>{" "}
                    {categoryLabel(m.category)}
                    {m.message && (
                      <>
                        <br />
                        <Link href={`/admin/chat?c=${m.message.conversationId}`} className="table-link small-link">
                          Open chat
                        </Link>
                      </>
                    )}
                    {m.sentBy && m.direction === "OUTBOUND" && (
                      <>
                        <br />
                        <small className="section-sub">
                          by {m.sentBy.firstName} {m.sentBy.lastName}
                        </small>
                      </>
                    )}
                  </td>
                  <td className="sms-body">{m.body}</td>
                  <td>
                    {m.status === "SENT" && m.provider === "console" ? (
                      <span className="status-pill status-pending" title="Test mode: logged only, not delivered to a phone">
                        Logged only
                      </span>
                    ) : (
                      <span className={`status-pill ${STATUS_CLASS[m.status]}`}>{categoryLabel(m.status)}</span>
                    )}
                    {m.error && <small className="sms-error">{m.error}</small>}
                  </td>
                  <td className="row-actions">
                    {m.direction === "OUTBOUND" && (m.status === "FAILED" || m.status === "SKIPPED") && (
                      <SmsLogActions mode="retry" id={m.id} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav className="pager">
          {page > 1 && (
            <Link href={href({ page: page - 1 })} className="btn btn-outline btn-sm">
              Previous
            </Link>
          )}
          <span className="section-sub">
            Page {page} of {pages}
          </span>
          {page < pages && (
            <Link href={href({ page: page + 1 })} className="btn btn-outline btn-sm">
              Next
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
