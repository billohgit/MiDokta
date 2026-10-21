import Link from "next/link";
import { redirect } from "next/navigation";
import { PORTAL_HOME, getSessionUser } from "@/lib/auth";
import Logo from "@/components/Logo";
import { DEFAULT_COUNTRY } from "@/lib/sms/phone";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";
import { getDictionary } from "@/lib/i18n/server";
import LoginTabs from "./LoginTabs";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const user = await getSessionUser();
  const home = user && PORTAL_HOME[user.role];
  if (home) redirect(home);
  const { as } = await searchParams;
  const d = await getDictionary();

  return (
    <main className="login-page">
      <div className="login-lang">
        <LanguageSwitcher />
      </div>
      <div className="card login-card">
        <div className="login-brand">
          <Logo stacked tagline />
        </div>
        <h1>{d.login.welcome}</h1>
        <p className="login-sub">{d.login.subtitle}</p>
        <LoginTabs defaultCountry={DEFAULT_COUNTRY} initial={as === "staff" ? "staff" : "patient"} />
        <p className="login-alt">
          <Link href="/terms">{d.login.terms}</Link>
        </p>
      </div>
    </main>
  );
}
