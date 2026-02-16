"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; icon: string };

const ITEMS: Item[] = [
  { href: "/dashboard", label: "Home", icon: "🏠" },
  { href: "/play", label: "Play", icon: "⛳" },
  { href: "/dashboard/sessions", label: "Sessions", icon: "📈" },
  { href: "/plan", label: "Plan", icon: "🗓️" },
  { href: "/profile", label: "Profile", icon: "👤" },
];

export default function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-neutral-800 bg-neutral-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-2 py-2">
        {ITEMS.map((it) => {
          const active = pathname === it.href || (it.href !== "/dashboard" && pathname.startsWith(it.href));
          return (
            <Link
              key={it.href}
              href={it.href}
              className={[
                "flex w-full flex-col items-center justify-center gap-1 rounded-xl px-2 py-2",
                active ? "bg-neutral-900/70" : "hover:bg-neutral-900/40",
              ].join(" ")}
            >
              <span className="text-lg" aria-hidden>
                {it.icon}
              </span>
              <span className="text-[10px] text-neutral-400">{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
