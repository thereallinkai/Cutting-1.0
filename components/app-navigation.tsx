"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardList,
  Leaf,
  Settings,
  SunMedium,
} from "lucide-react";

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

export function Sidebar({ email, name }: { email: string; name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <aside className="sidebar">
      <Link className="brand" href="/today">
        <span className="brand-mark" aria-hidden="true"><Leaf size={19} /></span>
        Cutting Plan
      </Link>
      <NavigationLinks />
      <div className="sidebar-footer">
        <div className="profile-chip">
          <span className="avatar" aria-hidden="true">{initials || "CP"}</span>
          <div>
            <strong>{name}</strong>
            <small>{email}</small>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function MobileNavigation() {
  return <NavigationLinks mobile />;
}
