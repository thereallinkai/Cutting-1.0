"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardList,
  Settings,
  SunMedium,
} from "lucide-react";
import { BrandLink } from "@/components/brand-link";

const items = [
  { href: "/today", label: "Today", icon: SunMedium },
  { href: "/plan", label: "My Plan", icon: ClipboardList },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/progress", label: "Progress", icon: ChartNoAxesCombined },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavigationLinks({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className={mobile ? "mobile-nav" : "app-nav"} aria-label="Primary navigation">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            className={`nav-link ${active ? "active" : ""}`}
            href={href}
            key={href}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={mobile ? 20 : 19} strokeWidth={1.9} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function initialsFor(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "LG"
  );
}

export function Sidebar({ email, name }: { email: string; name: string }) {
  const pathname = usePathname();
  const initials = initialsFor(name);
  const profileActive =
    pathname === "/profile" || pathname.startsWith("/profile/");
  return (
    <aside className="sidebar">
      <BrandLink href="/today" />
      <NavigationLinks />
      <div className="sidebar-footer">
        <Link
          aria-current={profileActive ? "page" : undefined}
          aria-label={`Open profile for ${name}`}
          className={`profile-chip${profileActive ? " active" : ""}`}
          data-tour="profile"
          href="/profile"
        >
          <span className="avatar" aria-hidden="true">{initials}</span>
          <div>
            <strong>{name}</strong>
            <small>{email}</small>
          </div>
        </Link>
      </div>
    </aside>
  );
}

export function MobileHeader({ name }: { name: string }) {
  return (
    <header className="mobile-app-header">
      <BrandLink href="/today" />
      <Link
        className="mobile-profile-link"
        href="/profile"
        aria-label={`Open profile for ${name}`}
      >
        <span className="avatar" aria-hidden="true">{initialsFor(name)}</span>
      </Link>
    </header>
  );
}

export function MobileNavigation() {
  return <NavigationLinks mobile />;
}
