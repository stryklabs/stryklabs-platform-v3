"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api/http";

type Item = { href: string; label: string; icon: string };

const BASE_ITEMS: Item[] = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/dashboard/sessions", label: "Sessions", icon: "📈" },
  { href: "/plan", label: "Plan", icon: "🗓️" },
  { href: "/smart-bag", label: "Smart Bag", icon: "🎒" },
  { href: "/community", label: "Community", icon: "👥" },
  { href: "/profile", label: "Profile", icon: "👤" },
];

const ADMIN_ITEM: Item = { href: "/admin", label: "Admin", icon: "🛠️" };

export default function LeftMenu() {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const j = await apiFetch<any>("/api/whoami");
        if (!alive) return;
        setIsAdmin(Boolean((j as any)?.is_admin));
      } catch {
        // ignore
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const items = useMemo(() => (isAdmin ? [...BASE_ITEMS, ADMIN_ITEM] : BASE_ITEMS), [isAdmin]);

  return (
    <div className="flex h-full flex-col p-2">
      {/* Logo */}
      <div className="mb-3 flex h-10 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 text-sm font-semibold">
        S
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1">
        {items.map((item) => {
          const active = pathname === item.href || (item.href === "/admin/coaching-ops" && pathname.startsWith("/admin"));
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={[
                "flex h-10 items-center justify-center rounded-xl border text-lg",
                active
                  ? "border-neutral-600 bg-neutral-900/70"
                  : "border-transparent hover:border-neutral-800 hover:bg-neutral-900/40",
              ].join(" ")}
            >
              <span aria-hidden>{item.icon}</span>
              <span className="sr-only">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom pinned */}
      <div className="mt-auto pt-2">
        <Link
          href="/profile"
          title="Profile"
          className="flex h-10 items-center justify-center rounded-xl border border-transparent text-lg hover:border-neutral-800 hover:bg-neutral-900/40"
        >
          <span aria-hidden>👤</span>
          <span className="sr-only">Profile</span>
        </Link>
      </div>
    </div>
  );
}
