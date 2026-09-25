import { Role, type VerificationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CHECKS, type VerificationReport } from "@/lib/verification";
import { formatDate, formatTime } from "@/components/appointments/shared";
import VerificationActions from "@/components/verifications/VerificationActions";
import AutoRefresh from "@/components/verifications/AutoRefresh";

export const dynamic = "force-dynamic";

const STATUS: Record<VerificationStatus, { label: string; className: string; icon: string }> = {
  PENDING: { label: "Checking...", className: "status-pending", icon: "fa-spinner fa-spin" },
  PASSED: { label: "Checks passed", className: "status-confirmed", icon: "fa-circle-check" },
  FLAGGED: { label: "Needs a closer look", className: "status-rejected", icon: "fa-triangle-exclamation" },
  ERROR: { label: "Check didn't run", className: "status-muted", icon: "fa-circle-exclamation" },
};

const RESULT_ICON = {
  pass: "fa-solid fa-circle-check check-pass",
  fail: "fa-solid fa-circle-xmark check-fail",
  unclear: "fa-solid fa-circle-question check-unclear",
};

const roleLabel = (r: string) => r.charAt(0) + r.slice(1).toLowerCase();

export default async function AdminVerificationsPage() {
  await requireUser(Role.ADMIN);

  const pending = await prisma.user.findMany({
    where: { isActive: false, verificationStatus: { not: null } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="appt-header">
        <div>
          <h2 className="section-heading">Account Verification</h2>
          <p className="section-sub">
            New sign-ups wait here until you approve them. Each photo and ID is checked automatically with AI; the
            decision is yours.
          </p>
        </div>
      </div>
      <AutoRefresh active={pending.some((u) => u.verificationStatus === "PENDING")} />

      {pending.length === 0 ? (
        <div className="empty-banner">No sign-ups are waiting for approval.</div>
      ) : (
        <div className="verify-list">
          {pending.map((u) => {
            const status = STATUS[u.verificationStatus!];
            const report = (u.verificationReport ?? {}) as VerificationReport;
            return (
              <article key={u.id} className="card verify-card">
                <header className="verify-head">
                  <div>
                    <h3>
                      {u.firstName} {u.lastName}
                    </h3>
                    <p className="section-sub">
                      {roleLabel(u.role)} · {u.email} · {u.phone ?? "no phone"} · signed up {formatDate(u.createdAt.toISOString())}{" "}
                      {formatTime(u.createdAt.toISOString())}
                    </p>
                  </div>
                  <span className={`status-pill ${status.className}`}>
                    <i className={`fa-solid ${status.icon}`} /> {status.label}
                  </span>
                </header>

                <div className="verify-images">
                  <figure>
                    {u.avatarUrl ? (
                      <a href={u.avatarUrl} target="_blank" rel="noreferrer">
                        <img src={u.avatarUrl} alt={`Photo of ${u.firstName}`} />
                      </a>
                    ) : (
                      <div className="verify-missing">No photo</div>
                    )}
                    <figcaption>Photo</figcaption>
                  </figure>
                  <figure>
                    {u.idCardUrl ? (
                      <a href={`/api/uploads/id-cards/${u.id}`} target="_blank" rel="noreferrer">
                        <img src={`/api/uploads/id-cards/${u.id}`} alt={`ID card of ${u.firstName}`} />
                      </a>
                    ) : (
                      <div className="verify-missing">No ID card</div>
                    )}
                    <figcaption>Identity card</figcaption>
                  </figure>
                </div>

                {report.error ? (
                  <p className="form-warning">
                    <i className="fa-solid fa-circle-exclamation" /> {report.error}
                  </p>
                ) : report.checks ? (
                  <div className="verify-report">
                    {report.summary && <p className="verify-summary">{report.summary}</p>}
                    <dl className="verify-facts">
                      <div>
                        <dt>Document</dt>
                        <dd>{report.documentType ?? "Unknown"}</dd>
                      </div>
                      <div>
                        <dt>Name on document</dt>
                        <dd>{report.nameOnDocument ?? "Unreadable"}</dd>
                      </div>
                      <div>
                        <dt>Number</dt>
                        <dd>{report.documentNumber ?? "-"}</dd>
                      </div>
                      <div>
                        <dt>Expires</dt>
                        <dd>{report.expiryDate ?? "-"}</dd>
                      </div>
                    </dl>
                    <ul className="verify-checks">
                      {report.checks.map((c) => (
                        <li key={c.id}>
                          <i className={RESULT_ICON[c.result]} aria-label={c.result} />
                          <div>
                            <strong>{CHECKS[c.id] ?? c.id}</strong>
                            <small>{c.note}</small>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <VerificationActions
                  id={u.id}
                  name={`${u.firstName} ${u.lastName}`}
                  checking={u.verificationStatus === "PENDING"}
                />
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
