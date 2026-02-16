"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api/http";

type WhoAmI = {
  profile?: {
    id?: string;
    full_name?: string | null;
    username?: string | null;
    client_id?: string | null;
    subscription_tier?: string | null;
    role?: string | null;
    is_admin?: boolean | null;
  };
  subscription_tier?: string | null;
};

function shortId(v?: string | null) {
  if (!v) return "—";
  return v.length > 12 ? `${v.slice(0, 8)}…${v.slice(-4)}` : v;
}

export default function IdentityHeader() {
  const [who, setWho] = useState<WhoAmI | null>(null);
  const [showMeta, setShowMeta] = useState(false);

  useEffect(() => {
    const v = window.localStorage.getItem("stryklabs_debug_meta");
    setShowMeta(v === "1");
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const j = await apiFetch<WhoAmI>("/api/whoami");
        if (!alive) return;
        setWho(j);
      } catch {
        // safe fallback: show nothing
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const name = useMemo(() => {
    const p = who?.profile;
    return p?.full_name || p?.username || "—";
  }, [who]);

  const tier = useMemo(() => {
    const p = who?.profile;
    return p?.subscription_tier || who?.subscription_tier || null;
  }, [who]);

  function toggleMeta() {
    const next = !showMeta;
    setShowMeta(next);
    window.localStorage.setItem("stryklabs_debug_meta", next ? "1" : "0");
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col leading-tight">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold text-neutral-100">{name}</div>
          {tier ? (
            <span className="rounded-full border border-neutral-800 bg-neutral-900/40 px-2 py-0.5 text-[11px] text-neutral-300">
              {tier}
            </span>
          ) : null}
        </div>

        {showMeta ? (
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-neutral-500">
            <span>user:{shortId(who?.profile?.id)}</span>
            <span>client:{shortId(who?.profile?.client_id)}</span>
            <button
              onClick={toggleMeta}
              className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-0.5 text-[11px] text-neutral-400 hover:bg-neutral-900/40"
              title="Hide debug meta"
            >
              Hide
            </button>
          </div>
        ) : (
          <button
            onClick={toggleMeta}
            className="mt-0.5 w-fit rounded-md border border-transparent px-1 text-[11px] text-neutral-600 hover:text-neutral-400"
            title="Show debug meta"
          >
            Debug
          </button>
        )}
      </div>
    </div>
  );
}
