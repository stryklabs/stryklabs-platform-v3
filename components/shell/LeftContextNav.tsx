"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { apiFetch } from "@/lib/api/http";

type WindowKey = "6m" | "1y" | "all";

type SessionListItem = {
  session_id: string;
  session_date: string | null;
  created_at: string | null;
  shot_count: number;
};

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

export default function LeftContextNav() {
  const pathname = usePathname();
  const isSessions = pathname.startsWith("/dashboard/sessions");

  // Do not reserve space on non-sessions pages
  if (!isSessions) return null;

  // Uses useSearchParams(), so it must be Suspense-wrapped (Next 16).
  return (
    <aside className="hidden md:block w-72 shrink-0 border-r border-neutral-800">
      <Suspense fallback={<div className="p-4 text-sm opacity-60">Loading…</div>}>
        <SessionsContextPanel />
      </Suspense>
    </aside>
  );
}

function SessionsContextPanel() {
  const router = useRouter();
  const sp = useSearchParams();

  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Determine admin flag via cookie-auth whoami endpoint. Safe default is false.
    (async () => {
      try {
        const j = await apiFetch<any>("/api/whoami");
        const admin = Boolean(j?.profile?.is_admin || j?.profile?.role === "admin" || j?.is_admin || j?.role === "admin");
        setIsAdmin(admin);
      } catch {
        // ignore
      }
    })();
  }, []);

  const [window, setWindow] = useState<WindowKey>("6m");
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selected = sp.get("session");

  useEffect(() => {
    (async () => {
      setErr(null);
      setLoading(true);

      try {
        // Cookie-auth: /api/sessions/list reads the logged-in session from cookies.
        const json = await apiFetch<any>(`/api/sessions/list?window=${window}`);
        const rows: SessionListItem[] = Array.isArray(json?.sessions) ? json.sessions : [];
        setSessions(rows);

        // Auto-select latest session if none selected
        if (!selected && rows[0]?.session_id) {
          router.replace(`/dashboard/sessions?session=${rows[0].session_id}`);
        }
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load sessions");
        setSessions([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [window, selected, router]);

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pt-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-neutral-100">Sessions</div>
          <div className="text-xs text-neutral-500">Filter</div>
        </div>

        <div className="mt-3 space-y-2">
          <div className="text-[11px] text-neutral-500">Window</div>
          <select
            value={window}
            onChange={(e) => setWindow(e.target.value as WindowKey)}
            className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
          >
            <option value="6m">Last 6 months</option>
            <option value="1y">Last year</option>
            <option value="all">All time</option>
          </select>
        </div>
      </div>

      <div className="mt-3 flex-1 overflow-y-auto px-2 pb-2">
        {loading && <div className="px-2 py-2 text-sm text-neutral-400">Loading…</div>}
        {err && (
          <div className="mx-2 my-2 rounded-lg border border-red-900 bg-red-950/30 px-2 py-2 text-xs text-red-300">
            {err}
          </div>
        )}

        <div className="grid gap-2">
          {sessions.map((s) => {
            const isActive = selected === s.session_id;
            return (
              <button
                key={s.session_id}
                onClick={() => router.replace(`/dashboard/sessions?session=${s.session_id}`)}
                className={[
                  "group w-full text-left rounded-xl border px-3 py-2 transition",
                  isActive
                    ? "border-neutral-600 bg-neutral-900/70"
                    : "border-neutral-800 bg-neutral-950 hover:bg-neutral-900/40",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs text-neutral-200">
                      {fmtDate(s.session_date ?? s.created_at)}
                    </div>
                    <div className="mt-0.5 text-[11px] text-neutral-500">{s.shot_count} shots</div>
                  </div>

                  <div
                    className={[
                      "mt-0.5 h-2 w-2 rounded-full",
                      isActive ? "bg-emerald-400" : "bg-neutral-700 group-hover:bg-neutral-500",
                    ].join(" ")}
                    title={isActive ? "Selected" : "Select"}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-neutral-800 p-2">
        <button
          onClick={() => router.push(isAdmin ? "/admin/upload" : "/upload")}
          className="w-full rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-sm hover:bg-neutral-900/70"
        >
          Upload new session
        </button>
      </div>
    </div>
  );
}