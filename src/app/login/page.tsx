import { redirect } from "next/navigation";
import { PORTAL_HOME, getSessionUser } from "@/lib/auth";
import Logo from "@/components/Logo";
import { DEFAULT_COUNTRY } from "@/lib/sms/phone";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getSessionUser();
  const home = user && PORTAL_HOME[user.role];
  if (home) redirect(home);

  return (
    <main className="login-page">
      <div className="card login-card">
        <div className="login-brand">
          <Logo stacked tagline />
        </div>
        <h1>Welcome back</h1>
        <p className="login-sub">Sign in to your account</p>
        <LoginForm defaultCountry={DEFAULT_COUNTRY} />
      </div>
    </main>
  );
}
