"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/http";

type WhoAmI = {
  profile?: {
    full_name?: string | null;
    username?: string | null;
    handicap?: number | null;
    experience?: string | null;
    subscription_tier?: string | null;
  };
};

export default function ProfilePage() {
  const [who, setWho] = useState<WhoAmI | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const j = await apiFetch<WhoAmI>("/api/whoami");
        if (!alive) return;
        setWho(j);
      } catch {
        // ignore
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const p = who?.profile;

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold">Profile</h1>
      <p className="mt-2 text-sm text-neutral-400">Identity, subscriptions, and preferences.</p>

      <div className="mt-6 grid gap-4">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
          <div className="text-sm font-semibold">Identity</div>
          <div className="mt-3 grid gap-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">Name</span>
              <span className="text-neutral-200">{p?.full_name || "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">Username</span>
              <span className="text-neutral-200">{p?.username || "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">Handicap</span>
              <span className="text-neutral-200">{typeof p?.handicap === "number" ? p.handicap : "—"}</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Subscription</div>
              <div className="mt-1 text-xs text-neutral-500">Tier-based gating lands in Phase 1.</div>
            </div>
            <span className="rounded-full border border-neutral-800 bg-neutral-900/40 px-2 py-0.5 text-[11px] text-neutral-300">
              {p?.subscription_tier || "Free"}
            </span>
          </div>

          <div className="mt-4 flex gap-2">
            <button className="h-10 rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 text-sm hover:bg-neutral-900/70">
              Manage
            </button>
            <button className="h-10 rounded-xl border border-neutral-800 bg-neutral-950 px-4 text-sm text-neutral-400 hover:bg-neutral-900/40">
              Upgrade
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
