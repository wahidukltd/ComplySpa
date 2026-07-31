"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { getActionCount } from "@/lib/actions/compliance-actions";
import {
  LayoutDashboard,
  Users,
  UserCheck,
  ShieldCheck,
  FileText,
  Bell,
  Settings,
  ListChecks,
  X,
  type LucideIcon,
} from "lucide-react";

const navItems: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Actions", href: "/dashboard/actions", icon: ListChecks },
  { label: "Staff", href: "/dashboard/staff", icon: Users },
  { label: "Onboarding", href: "/dashboard/onboarding", icon: UserCheck },
  { label: "Credentials", href: "/dashboard/credentials", icon: ShieldCheck },
  { label: "Reports", href: "/dashboard/reports", icon: FileText },
  { label: "Alerts", href: "/dashboard/alerts", icon: Bell },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

function NavLink({
  item,
  active,
  badge,
  onNavigate,
}: {
  item: { label: string; href: string; icon: LucideIcon };
  active: boolean;
  badge?: number;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="flex-1">{item.label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="inline-flex items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-medium text-destructive-foreground min-w-[18px] h-[18px]">
          {badge}
        </span>
      )}
    </Link>
  );
}

export function Sidebar({
  open,
  onClose,
  actionsCount: _actionsCount = 0,
}: {
  open: boolean;
  onClose: () => void;
  actionsCount?: number;
}) {
  const pathname = usePathname();
  const [badgeCount, setBadgeCount] = useState(_actionsCount);

  useEffect(() => {
    getActionCount().then((count) => setBadgeCount(count)).catch(() => {});
  }, [pathname]);

  function isActive(href: string): boolean {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <>
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex xl:w-72 2xl:w-80">
        <div className="flex h-16 items-center gap-2 border-b border-border px-6">
          <ShieldCheck className="size-5 text-primary" />
          <span className="font-heading text-base font-semibold">Compliance</span>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {navItems.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActive(item.href)}
                  badge={item.label === "Actions" ? badgeCount : undefined}
                  onNavigate={onClose}
                />
          ))}
        </nav>
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={onClose}
            aria-hidden="true"
          />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-border bg-card">
            <div className="flex h-16 items-center justify-between border-b border-border px-6">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-primary" />
                <span className="font-heading text-base font-semibold">
                  Compliance
                </span>
              </div>
              <button
                onClick={onClose}
                aria-label="Close navigation"
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 p-4">
              {navItems.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActive(item.href)}
              badge={item.label === "Actions" ? badgeCount : undefined}
                  onNavigate={onClose}
                />
              ))}
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}
