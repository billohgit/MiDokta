import Link from "next/link";
import { logout } from "@/app/actions/auth";
import NotificationBell from "./notifications/NotificationBell";
import LanguageSwitcher from "./i18n/LanguageSwitcher";
import { useDictionary } from "./i18n/LocaleProvider";

export type TopbarUser = { initials: string; avatarUrl: string | null };

type Props = { title: string; user: TopbarUser; basePath: string; onToggle: () => void };

export default function Topbar({ title, user, basePath, onToggle }: Props) {
  const d = useDictionary();
  return (
    <header className="topbar">
      <div className="topbar-left">
        <i className="fa-solid fa-table-cells-large topbar-crumb" />
        <h1 className="page-title">{title}</h1>
        <button className="icon-btn" onClick={onToggle} aria-label={d.topbar.toggleSidebar}>
          <i className="fa-solid fa-bars" />
        </button>
      </div>
      <div className="topbar-right">
        <LanguageSwitcher />
        <NotificationBell viewAllHref={`${basePath}/notifications`} />
        <Link href={`${basePath}/settings`} className="avatar" aria-label={d.topbar.accountSettings}>
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt={user.initials} />
          ) : (
            user.initials
          )}
        </Link>
        <form action={logout}>
          <button type="submit" className="icon-btn" aria-label={d.topbar.signOut} title={d.topbar.signOut}>
            <i className="fa-solid fa-right-from-bracket" />
          </button>
        </form>
      </div>
    </header>
  );
}
