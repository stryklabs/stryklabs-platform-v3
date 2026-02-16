"use client";

import { usePathname, useRouter } from "next/navigation";

import { apiFetch } from "@/lib/api/http";
import IdentityHeader from "@/components/shell/IdentityHeader";

function titleFromPath(pathname: string) {
  if (pathname === "/dashboard") return "Home";
  if (pathname.startsWith("/dashboard/sessions")) return "Sessions";
  if (pathname === "/plan" || pathname === "/progression") return "Plan";
  if (pathname === "/smart-bag") return "Smart Bag";
  if (pathname === "/community") return "Community";
  if (pathname === "/profile") return "Profile";
  if (pathname.startsWith("/admin")) return "Admin";
  return "STRYKLabs";
}

export default function TopBar() {
  const pathname = usePathname();
  const router = useRouter();

  const title = titleFromPath(pathname);

  async function handleLogout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <div className="h-14 border-b border-neutral-800 bg-neutral-950 px-4 flex items-center justify-between">
      {/* Left */}
      <div className="flex items-center gap-4">
        <div className="text-sm font-semibold">{title}</div>
        <div className="hidden md:block">
          <IdentityHeader />
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        <button
          className="h-9 rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 text-sm hover:bg-neutral-900/70"
          title="Upgrade"
        >
          Upgrade
        </button>

        <button
          className="h-9 w-9 rounded-xl border border-neutral-800 bg-neutral-900/40 hover:bg-neutral-900/70"
          title="Notifications"
        >
          <span className="relative inline-flex">
            <span aria-hidden>🔔</span>
            <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-emerald-400" />
          </span>
        </button>

        <button
          onClick={() => router.push("/profile")}
          className="h-9 w-9 rounded-xl border border-neutral-800 bg-neutral-900/40 hover:bg-neutral-900/70"
          title="Profile"
        >
          👤
        </button>

        <button
          onClick={handleLogout}
          className="h-9 rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 text-sm hover:bg-neutral-900/70 text-red-400"
          title="Log out"
        >
          Log out
        </button>
      </div>
    </div>
  );
}
