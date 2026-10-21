import Link from "next/link";
import Logo from "./Logo";
import { useDictionary } from "./i18n/LocaleProvider";
import type { NavLabel } from "@/lib/i18n/dictionaries";

/** `label` is a key into the dictionary's `nav` section, so the menu follows the chosen language. */
export type NavItem = { href: string; label: NavLabel; icon: string };

/** Badge counts keyed by nav href. */
export type NavBadges = Record<string, number>;

type Props = { nav: NavItem[]; badges?: NavBadges; pathname: string; onNavigate: () => void };

export default function Sidebar({ nav, badges = {}, pathname, onNavigate }: Props) {
  const d = useDictionary();
  return (
    <aside className="sidebar">
      <Link href={nav[0]?.href ?? "/"} className="brand-link">
        <Logo />
      </Link>
      <hr className="divider" />
      <nav className="nav">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`nav-item${pathname.startsWith(item.href) ? " active" : ""}`}
          >
            <span className="nav-icon">
              <i className={`fa-solid ${item.icon}`} />
            </span>
            <span className="nav-label">{d.nav[item.label]}</span>
            {badges[item.href] > 0 && <span className="nav-badge">{badges[item.href] > 99 ? "99+" : badges[item.href]}</span>}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
