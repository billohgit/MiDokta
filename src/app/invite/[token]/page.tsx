import Link from "next/link";
import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { openInvite } from "@/lib/invites";
import { formatMoney } from "@/lib/money";
import { formatDate, formatTime } from "@/components/appointments/shared";
import Logo from "@/components/Logo";
import InviteSignupForm from "./InviteSignupForm";

export const dynamic = "force-dynamic";

// The token in this URL is the invitation: keep it out of search engines and referrers.
export const metadata: Metadata = { title: "Your appointment | Mi Dokta", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** Where an invited patient lands from the text: see the visit their doctor booked, and register to confirm it. */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invite, user] = await Promise.all([openInvite(token), getSessionUser()]);

  return (
    <main className="login-page">
      <div className="card login-card">
        <div className="login-brand">
          <Logo stacked tagline />
        </div>
        {!invite ? (
          <>
            <h1>Invitation not valid</h1>
            <p className="login-sub">This link has expired, was cancelled, or has already been used. Ask your doctor to send a new one.</p>
            <Link href="/login" className="btn btn-primary login-btn">
              Sign in
            </Link>
          </>
        ) : user ? (
          <>
            <h1>You&apos;re signed in</h1>
            <p className="login-sub">This invitation is for someone new to MiDokta. Sign out first if you&apos;re registering for them.</p>
          </>
        ) : (
          <>
            <h1>Your appointment with Dr. {invite.doctor.lastName}</h1>
            <section className="invite-visit">
              <p>
                <i className="fa-solid fa-user-doctor" /> Dr. {invite.doctor.firstName} {invite.doctor.lastName}
                {invite.doctor.specialty && <span className="section-sub"> · {invite.doctor.specialty}</span>}
              </p>
              <p>
                <i className="fa-solid fa-calendar-day" /> {formatDate(invite.startsAt.toISOString())} at {formatTime(invite.startsAt.toISOString())}
                {invite.visitType === "VIDEO_CALL" && <span className="section-sub"> · video call in the app</span>}
              </p>
              <p>
                <i className="fa-solid fa-notes-medical" /> {invite.title}
              </p>
              <p>
                <i className="fa-solid fa-money-bill-wave" /> {invite.fee ? `Fee ${formatMoney(invite.fee.toString())}, paid online after you register` : "No fee"}
              </p>
            </section>
            <p className="login-sub">Register with MiDokta to confirm it. It takes a couple of minutes.</p>
            <InviteSignupForm
              token={token}
              firstName={invite.firstName}
              lastName={invite.lastName}
              phone={invite.phone}
              fee={invite.fee ? formatMoney(invite.fee.toString()) : null}
            />
          </>
        )}
      </div>
    </main>
  );
}
