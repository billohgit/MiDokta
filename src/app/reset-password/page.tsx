import { redirect } from "next/navigation";
import { PORTAL_HOME, getSessionUser } from "@/lib/auth";
import { DEFAULT_COUNTRY } from "@/lib/sms/phone";
import Logo from "@/components/Logo";
import ResetPasswordForm from "./ResetPasswordForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Reset password | Mi Dokta" };

export default async function ResetPasswordPage() {
  const user = await getSessionUser();
  const home = user && PORTAL_HOME[user.role];
  if (home) redirect(home);

  return (
    <main className="login-page">
      <div className="card login-card">
        <div className="login-brand">
          <Logo stacked tagline />
        </div>
        <h1>Reset your password</h1>
        <ResetPasswordForm defaultCountry={DEFAULT_COUNTRY} />
      </div>
    </main>
  );
}
