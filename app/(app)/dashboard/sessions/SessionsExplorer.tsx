"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSupabase } from "@/lib/supabase/useSupabase";
import { useRouter, useSearchParams } from "next/navigation";
import VerticalResizeSplit from "@/components/layout/VerticalResizeSplit";

/* =======================
   Types
======================= */

type SessionListItem = {
  session_id: string;
  session_date: string | null;
  created_at: string | null;
  shot_count: number;
  // optional in some responses
  import_id?: string | null;
};

type ShotRow = {
  id: string;
  shot_number: number | null;

  carry: number | null;
  total: number | null;
  side: number | null;

  ball_speed: number | null;
  club_speed: number | null;
  launch_angle: number | null;

  back_spin: number | null;
  side_spin: number | null;

  club?: string | null;
  data?: any;
  club_label?: string | null;

  created_at: string | null;
};

type SnapshotResponse =
  | {
      session_id: string;
      created_at: string;
      stats_json: Record<string, unknown>;
    }
  | null;

type HoverSource = "plot" | "table" | null;

type CoachingPanelResponse = {
  ok: boolean;
  request_id?: string;
  client_id?: string;
  session_id?: string;
  active_plan3m?: any;
  sessioncoach?: any;
  error?: string;
};

/* =======================
   Helpers
======================= */

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

function fmtNum(n: number | null) {
  if (n == null) return "—";
  return Number.isFinite(n) ? n.toFixed(1) : "—";
}

function estimateClubSpeed(ballSpeed: number | null) {
  if (!ballSpeed || ballSpeed <= 0) return null;
  // Heuristic: smash ~1.33 blended irons/woods. Used ONLY when club_speed missing/0.
  return ballSpeed / 1.33;
}

function deriveClubLabel(s: ShotRow): string | null {
  if (s.club && s.club.trim()) return s.club.trim();
  const d = s.data;
  const c1 = d?.club;
  const c2 = d?._raw?.Club;
  const c3 = d?.Club;
  if (typeof c1 === "string" && c1.trim()) return c1.trim();
  if (typeof c2 === "string" && c2.trim()) return c2.trim();
  if (typeof c3 === "string" && c3.trim()) return c3.trim();
  return null;
}

function getNumber(obj: unknown, path: string[]): number | null {
  let cur: any = obj;
  for (const key of path) {
    if (cur == null || typeof cur !== "object") return null;
    cur = cur[key];
  }
  return typeof cur === "number" && Number.isFinite(cur) ? cur : null;
}



/* =======================
   Main Component
======================= */

export default function SessionsExplorer() {
  const supabase = useSupabase();
  const router = useRouter();
  const sp = useSearchParams();
  const urlSessionId = sp.get("session");

  const [timeWindow, setTimeWindow] = useState<"6m" | "1y" | "all">("6m");

  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const [shots, setShots] = useState<ShotRow[]>([]);
  const [snapshot, setSnapshot] = useState<SnapshotResponse>(null);

  const [clubFilter, setClubFilter] = useState<string>("all");

  // Multi-select (toggle on click)
  const [selectedShotIds, setSelectedShotIds] = useState<Set<string>>(new Set());

  // Hover sync
  const [hoveredShotId, setHoveredShotId] = useState<string | null>(null);
  const [hoverSource, setHoverSource] = useState<HoverSource>(null);

  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingShots, setLoadingShots] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const tableScrollRef = useRef<HTMLDivElement>(null);

  const [coachingOpen, setCoachingOpen] = useState(false);
  const [coachingLoading, setCoachingLoading] = useState(false);
  const [coachingErr, setCoachingErr] = useState<string | null>(null);
  const [coachingResp, setCoachingResp] = useState<CoachingPanelResponse | null>(null);

  /* =======================
     Load sessions
  ======================= */

  useEffect(() => {
    // M6: sessions list is cookie-auth native (no bearer token in browser)
    // Keep Supabase client for other reads (shots/snapshot) until those routes are migrated.
    if (!supabase) return;

    (async () => {
      setErr(null);
      setLoadingSessions(true);

      try {
        const res = await fetch(`/api/sessions/list?window=${timeWindow}`, {
          method: "GET",
          credentials: "include",
        });

        if (!res.ok) {
          if (res.status === 401) setErr("Unauthorized. Please refresh and sign in again.");
          else setErr(`sessions list failed: ${res.status}`);
          setSessions([]);
          setSelectedSessionId(null);
          return;
        }

        const json = await res.json();
        const rows: SessionListItem[] = Array.isArray(json?.sessions) ? json.sessions : [];
        setSessions(rows);

        // Respect URL selection if it exists + is valid; otherwise default to first session
        const desired =
          urlSessionId && rows.some((r) => r.session_id === urlSessionId)
            ? urlSessionId
            : rows[0]?.session_id ?? null;

        setSelectedSessionId(desired);

        // If URL doesn't have a session yet, set it so ContextNav + Explorer stay in sync
        if (!urlSessionId && desired) {
          router.replace(`/dashboard/sessions?session=${desired}`);
        }
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load sessions");
      } finally {
        setLoadingSessions(false);
      }
    })();
  }, [supabase, timeWindow, urlSessionId, router]);

  /* =======================
     Load shots + snapshot for selected session
  ======================= */

  useEffect(() => {
    if (!supabase || !selectedSessionId) return;

    (async () => {
      setErr(null);
      setLoadingShots(true);

      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          setErr("Unauthorized (no session token). Please refresh and sign in again.");
          setShots([]);
          setSnapshot(null);
          return;
        }

        const [shotsRes, snapRes] = await Promise.all([
          fetch(`/api/sessions/${selectedSessionId}/shots`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/sessions/${selectedSessionId}/snapshot`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (!shotsRes.ok) {
          setErr(`shots fetch failed: ${shotsRes.status}`);
          setShots([]);
        } else {
          const shotsJson = await shotsRes.json();
          const hydrated: ShotRow[] = (Array.isArray(shotsJson?.shots) ? shotsJson.shots : []).map((s: ShotRow) => ({
            ...s,
            club_label: deriveClubLabel(s),
          }));
          setShots(hydrated);

          // Reset selection & hover on session change
          setSelectedShotIds(new Set());
          setHoveredShotId(null);
          setHoverSource(null);

          // If current clubFilter doesn't exist in this session, reset to "all"
          const clubs = new Set<string>();
          hydrated.forEach((x) => {
            if (x.club_label) clubs.add(x.club_label);
          });
          if (clubFilter !== "all" && !clubs.has(clubFilter)) {
            setClubFilter("all");
          }

          // Scroll table to top on session change
          if (tableScrollRef.current) tableScrollRef.current.scrollTop = 0;
        }

        if (snapRes.ok) {
          const snapJson = await snapRes.json();
          setSnapshot(snapJson?.snapshot ?? null);
        } else {
          setSnapshot(null);
        }
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load session data");
      } finally {
        setLoadingShots(false);
      }
    })();
    // Intentionally omit clubFilter to avoid reload loop; we handle it after fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, selectedSessionId]);

  /* =======================
     Load coaching when panel is open
  ======================= */
    useEffect(() => {
  console.log("[coaching effect] fired", { selectedSessionId, coachingOpen });

  if (!selectedSessionId || !coachingOpen) return;

  const ctrl = new AbortController();

  (async () => {
    setCoachingLoading(true);
    setCoachingErr(null);

    try {
      // single source of truth for coaching fetch
      const url = `/api/coaching/panel?session_id=${encodeURIComponent(selectedSessionId)}`;
      console.log("[coaching effect] url", url);

      const res = await fetch(url, {
        method: "GET",
        credentials: "include",
        signal: ctrl.signal,
      });

      console.log("[coaching effect] fetch returned", res.status, res.ok);

      const json = (await res.json().catch(() => null)) as CoachingPanelResponse | null;

      if (!res.ok) {
        setCoachingErr((json as any)?.error || `coaching fetch failed: ${res.status}`);
        setCoachingResp(null);
        return;
      }

      setCoachingResp(json);
    } catch (e: any) {
      if (e.name !== "AbortError") {
        setCoachingErr(e?.message ?? "Failed to load coaching");
        setCoachingResp(null);
      }
    } finally {
      setCoachingLoading(false);
    }
  })();

  return () => ctrl.abort();
}, [selectedSessionId, coachingOpen]);


  /* =======================
     ESC closes coaching panel
  ======================= */

  useEffect(() => {
    if (!coachingOpen) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setCoachingOpen(false);
    }

    globalThis.window.addEventListener("keydown", onKeyDown);
    return () => globalThis.window.removeEventListener("keydown", onKeyDown);
  }, [coachingOpen]);

  /* =======================
     Derived: club options + filtered shots
  ======================= */

  const clubOptions = useMemo(() => {
    const set = new Set<string>();
    shots.forEach((s) => {
      if (s.club_label) set.add(s.club_label);
    });
    return ["all", ...Array.from(set).sort()];
  }, [shots]);

  const filteredBaseShots = useMemo(() => {
    return clubFilter === "all" ? shots : shots.filter((s) => s.club_label === clubFilter);
  }, [shots, clubFilter]);

  /**
   * IMPORTANT behavior:
   * - Hover on a dot should bring shot to top (good for large tables)
   * - BUT selecting from the table must not re-order (otherwise it fights clicking)
   *
   * We implement:
   * - Reorder ONLY when hover source is "plot" AND there are no selected shots.
   * - Table hover still highlights dots/rows but never reorders.
   */
  const displayShots = useMemo(() => {
    const base = filteredBaseShots;

    const canReorder = hoverSource === "plot" && selectedShotIds.size === 0;

    if (!canReorder || !hoveredShotId) return base;

    const hovered = base.find((s) => s.id === hoveredShotId);
    if (!hovered) return base;
    return [hovered, ...base.filter((s) => s.id !== hoveredShotId)];
  }, [filteredBaseShots, hoveredShotId, hoverSource, selectedShotIds]);

  /* =======================
     Cards (restore v1.1 layout)
  ======================= */

  const consistencyV11 = useMemo(() => {
    return getNumber(snapshot?.stats_json, ["signals_v1_1", "consistency", "aggregate", "overall_rate"]);
  }, [snapshot]);

  /* =======================
     Interaction helpers
  ======================= */

  function toggleSelect(id: string) {
    setSelectedShotIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function clearSelection() {
    setSelectedShotIds(new Set());
  }

  function setHover(id: string | null, source: HoverSource) {
    setHoveredShotId(id);
    setHoverSource(id ? source : null);
  }

  const sessionCoachJson = (coachingResp as any)?.sessioncoach?.session_coaching?.content_json ?? null;
  const coachingAvailable = Boolean(
    (coachingResp as any)?.sessioncoach?.found && sessionCoachJson?.schema_version === "sessioncoach_v1"
  );

  /* =======================
     Render
  ======================= */

  return (
    <div className="h-full relative">
      {/* Main */}
      <section className="h-full p-0">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="m-0 text-xl font-semibold">Session Explorer</h1>
            <div className="mt-1 text-sm text-neutral-400">
              Selected session:{" "}
              <code className="rounded bg-neutral-900 px-1.5 py-0.5 text-neutral-200">
                {selectedSessionId ?? "—"}
              </code>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCoachingOpen(true)}
              className="h-9 rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 text-sm hover:bg-neutral-900/70"
              title="Open session coaching"
            >
              Coaching
            </button>
          </div>
        </header>

        {err && (
          <div className="mt-4 rounded-xl border border-red-900 bg-red-950/30 p-3 text-sm text-red-200">
            <strong className="text-red-300">Error:</strong> <span className="opacity-90">{err}</span>
          </div>
        )}

        {/* Split: TOP = metrics + dispersion | BOTTOM = table only */}
        <div className="mt-4 h-[calc(100vh-220px)]">
          <VerticalResizeSplit
            top={
              <div className="h-full overflow-hidden flex flex-col">
                {/* Restore top cards area (v1.1 layout) */}
                <div className="grid gap-4 md:grid-cols-3">
                  <MetricCard
                    title="Consistency (Tightened)"
                    value={consistencyV11 != null ? `${Math.round(consistencyV11 * 100)}%` : "—"}
                    sub="Distance-adjusted (V1.1)"
                  />
                  <MetricCard title="Badges (placeholder)" value="—" sub="Per-session + historical (coming)" />
                  <MetricCard title="Snapshot Created" value={snapshot?.created_at ? fmtDate(snapshot.created_at) : "—"} />
                </div>

                {/* Dispersion plot */}
                <div className="mt-4 flex-1 min-h-[260px] overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 p-4">
                  <div className="text-sm font-semibold mb-2">Dispersion Plot (Side vs Carry)</div>
                  <div className="text-xs text-neutral-500 mb-3">
                    Hover a dot to surface it at the top of the table. Select rows to lock selection.
                  </div>

                  <DispersionPlot
                    shots={filteredBaseShots}
                    selected={selectedShotIds}
                    hovered={hoveredShotId}
                    onHover={(id) => setHover(id, "plot")}
                  />
                </div>
              </div>
            }
            bottom={
              <div className="h-full overflow-auto">
                <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-sm font-semibold">Raw Shots</div>

                    <div className="flex items-center gap-2">
                      {selectedShotIds.size > 0 && (
                        <button
                          onClick={clearSelection}
                          className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-sm hover:bg-neutral-900/70"
                        >
                          Clear selection
                        </button>
                      )}

                      <div className="flex items-center gap-2">
                        <label className="text-sm text-neutral-400">Club:</label>
                        <select
                          value={clubFilter}
                          onChange={(e) => setClubFilter(e.target.value)}
                          className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm"
                        >
                          {clubOptions.map((c) => (
                            <option key={c} value={c}>
                              {c === "all" ? "All clubs" : c}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {loadingShots ? (
                    <div className="mt-3 text-sm text-neutral-400">Loading shots…</div>
                  ) : (
                    <RawShotsTable
                      shots={displayShots}
                      selected={selectedShotIds}
                      hovered={hoveredShotId}
                      onToggleSelect={toggleSelect}
                      onHover={(id) => setHover(id, "table")}
                      scrollRef={tableScrollRef}
                    />
                  )}
                </div>
              </div>
            }
          />
        </div>
      </section>

      {/* Right Coaching Panel (Supabase-style slide-over) */}
      <div
        className={[
          "fixed inset-0 z-50",
          coachingOpen ? "pointer-events-auto" : "pointer-events-none",
        ].join(" ")}
        aria-hidden={!coachingOpen}
      >
        {/* overlay */}
        <div
          onClick={() => setCoachingOpen(false)}
          className={[
            "absolute inset-0 bg-black/40 transition-opacity",
            coachingOpen ? "opacity-100" : "opacity-0",
          ].join(" ")}
        />

        {/* panel */}
        <aside
          className={[
            "absolute right-0 top-14 h-[calc(100vh-3.5rem)] w-[420px] max-w-[92vw]",
            "border-l border-neutral-800 bg-neutral-950 shadow-2xl",
            "transition-transform duration-200",
            coachingOpen ? "translate-x-0" : "translate-x-full",
          ].join(" ")}
        >
          <div className="h-full flex flex-col">
            {/* header */}
            <div className="flex items-start justify-between gap-3 border-b border-neutral-800 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-neutral-100">Session coaching</div>
                <div className="mt-1 text-xs text-neutral-500">
                  Session:{" "}
                  <code className="rounded bg-neutral-900 px-1.5 py-0.5 text-neutral-200">
                    {selectedSessionId ?? "—"}
                  </code>
                </div>
              </div>

              <button
                onClick={() => setCoachingOpen(false)}
                className="h-8 w-8 rounded-lg border border-neutral-800 bg-neutral-900/40 text-neutral-200 hover:bg-neutral-900/70"
                title="Close"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* body */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="text-xs text-neutral-500">
                Coaching is read-only. No generation occurs in this view.
              </div>

              {coachingLoading && <div className="mt-3 text-sm text-neutral-300">Loading coaching…</div>}

              {coachingErr && (
                <div className="mt-3 rounded-xl border border-red-900 bg-red-950/30 p-3 text-sm text-red-200">
                  <strong className="text-red-300">Error:</strong> <span className="opacity-90">{coachingErr}</span>
                </div>
              )}

              {!coachingLoading && !coachingErr && (
                <div className="mt-4 space-y-4">
                  {/* Status row */}
                  <div className="rounded-xl border border-neutral-800 bg-neutral-900/20 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold">Status</div>
                      <div className="text-xs text-neutral-400">
                        {(() => {
                          const ts = (coachingResp as any)?.sessioncoach?.session_coaching?.created_at ?? null;
                          return ts ? `Updated: ${fmtDate(ts)}` : "—";
                        })()}
                      </div>
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={[
                          "inline-flex h-2 w-2 rounded-full",
                          coachingAvailable ? "bg-emerald-400" : "bg-neutral-600",
                        ].join(" ")}
                      />
                      <div className="text-sm text-neutral-200">
                        {coachingAvailable ? "Coaching available" : "No coaching available for this session"}
                      </div>
                    </div>

                    {!coachingAvailable && (
                      <div className="mt-2 text-xs text-neutral-500">
                        This is expected while generation is paused. UI is designed to snap onto persisted coaching later.
                      </div>
                    )}
                  </div>

                  {/* Coaching content */}
                  {coachingAvailable ? (
                    <CoachingPanelContent panel={coachingResp} />
                  ) : (
                    <PlaceholderCoaching />
                  )}

                  {/* Telemetry intentionally omitted in M6 UI read surface (panel route is minimal). */}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* =======================
   Coaching Panel Components
======================= */

function PlaceholderCoaching() {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
      <div className="text-sm font-semibold">V1 coaching surfaces</div>
      <div className="mt-2 text-sm text-neutral-300">
        This panel will show the persisted plan surfaces:
      </div>
      <ul className="mt-2 list-disc pl-5 text-sm text-neutral-400 space-y-1">
        <li>Next session plan</li>
        <li>3‑month plan</li>
        <li>6‑month plan</li>
        <li>Linked evidence (why this plan exists)</li>
      </ul>
      <div className="mt-3 text-xs text-neutral-500">
        Placeholder only — no AI is running here.
      </div>
    </div>
  );
}

function CoachingPanelContent({ panel }: { panel: CoachingPanelResponse | null }) {
  // M6: Single source is /api/coaching/panel
  const planJson = (panel as any)?.active_plan3m?.plan?.content_json ?? null;
  const coachJson = (panel as any)?.sessioncoach?.session_coaching?.content_json ?? null;

  const coachDisplay = coachJson?.display ?? null;

  return (
    <div className="space-y-4">
      <SectionCard title="Active 3‑Month Plan">
        <ContentBlock
          value={planJson}
          fallback="No active 3‑month plan found (client has no active_plan3m pointer yet)."
        />
      </SectionCard>

      <SectionCard title="Session Coaching">
        {coachDisplay ? (
          <div className="space-y-3">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-neutral-500">Session summary</div>
              <div className="mt-1 text-sm text-neutral-200 whitespace-pre-wrap leading-relaxed">
                {String(coachDisplay.session_summary ?? "—")}
              </div>
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-wide text-neutral-500">What stood out</div>
              <ContentBlock value={coachDisplay.what_stood_out ?? null} fallback="—" />
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-wide text-neutral-500">What this supports</div>
              <div className="mt-1 text-sm text-neutral-200 whitespace-pre-wrap leading-relaxed">
                {String(coachDisplay.what_this_supports ?? "—")}
              </div>
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-wide text-neutral-500">Next session focus</div>
              <div className="mt-1 text-sm text-neutral-200 whitespace-pre-wrap leading-relaxed">
                {String(coachDisplay.next_session_focus ?? "—")}
              </div>
            </div>

            {(coachDisplay.drill || coachDisplay.constraint || coachDisplay.checkpoint) && (
              <div className="grid gap-3 md:grid-cols-3">
                {coachDisplay.drill && (
                  <div className="rounded-xl border border-neutral-800 bg-neutral-900/20 p-3">
                    <div className="text-[11px] uppercase tracking-wide text-neutral-500">Drill</div>
                    <div className="mt-1 text-sm text-neutral-200 whitespace-pre-wrap leading-relaxed">
                      {String(coachDisplay.drill)}
                    </div>
                  </div>
                )}
                {coachDisplay.constraint && (
                  <div className="rounded-xl border border-neutral-800 bg-neutral-900/20 p-3">
                    <div className="text-[11px] uppercase tracking-wide text-neutral-500">Constraint</div>
                    <div className="mt-1 text-sm text-neutral-200 whitespace-pre-wrap leading-relaxed">
                      {String(coachDisplay.constraint)}
                    </div>
                  </div>
                )}
                {coachDisplay.checkpoint && (
                  <div className="rounded-xl border border-neutral-800 bg-neutral-900/20 p-3">
                    <div className="text-[11px] uppercase tracking-wide text-neutral-500">Checkpoint</div>
                    <div className="mt-1 text-sm text-neutral-200 whitespace-pre-wrap leading-relaxed">
                      {String(coachDisplay.checkpoint)}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-900/20 p-3">
              <div className="text-sm font-semibold">Plan status</div>
              <div className="text-sm text-neutral-200">{String(coachDisplay.plan_status ?? "—")}</div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-neutral-400">No persisted session coaching found for this session.</div>
        )}
      </SectionCard>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function ContentBlock({ value, fallback }: { value: any; fallback: string }) {
  if (value == null) return <div className="text-sm text-neutral-400">{fallback}</div>;

  if (typeof value === "string") {
    return <div className="text-sm text-neutral-200 whitespace-pre-wrap leading-relaxed">{value}</div>;
  }

  // array of strings / objects
  if (Array.isArray(value)) {
    return (
      <ul className="list-disc pl-5 space-y-1 text-sm text-neutral-200">
        {value.map((v, i) => (
          <li key={i}>
            {typeof v === "string" ? (
              <span className="whitespace-pre-wrap">{v}</span>
            ) : (
              <code className="text-xs text-neutral-300">{JSON.stringify(v)}</code>
            )}
          </li>
        ))}
      </ul>
    );
  }

  // object
  if (typeof value === "object") {
    return (
      <pre className="whitespace-pre-wrap text-xs text-neutral-200 leading-relaxed">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }

  return <div className="text-sm text-neutral-200">{String(value)}</div>;
}

/* =======================
   UI Components
======================= */

function MetricCard({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
      <div className="text-sm text-neutral-400">{title}</div>
      <div className="mt-2 text-2xl">{value}</div>
      {sub && <div className="mt-1.5 text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}

function RawShotsTable({
  shots,
  selected,
  hovered,
  onToggleSelect,
  onHover,
  scrollRef,
}: {
  shots: ShotRow[];
  selected: Set<string>;
  hovered: string | null;
  onToggleSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  if (!shots.length) return <div className="mt-3 text-sm text-neutral-400">No shots.</div>;

  return (
    <div ref={scrollRef} className="mt-3 h-full overflow-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="text-left text-neutral-400/80">
            {["#", "Club", "Carry", "Total", "Side", "Ball", "ClubSpd", "LA", "Back", "SideSpin"].map((h) => (
              <th key={h} className="px-2.5 py-2 border-b border-neutral-800 whitespace-nowrap font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shots.map((s, idx) => {
            const isSelected = selected.has(s.id);
            const isHovered = hovered === s.id;
            const clubSpd = s.club_speed && s.club_speed !== 0 ? s.club_speed : estimateClubSpeed(s.ball_speed);

            return (
              <tr
                key={s.id}
                onClick={() => onToggleSelect(s.id)}
                onMouseEnter={() => onHover(s.id)}
                onMouseLeave={() => onHover(null)}
                className={[
                  "cursor-pointer transition-colors",
                  isHovered ? "bg-white/10" : isSelected ? "bg-white/5" : "bg-transparent",
                ].join(" ")}
              >
                <td className="px-2.5 py-2 whitespace-nowrap">{s.shot_number ?? idx + 1}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">{s.club_label ?? "—"}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">{fmtNum(s.carry)}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">{fmtNum(s.total)}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">{fmtNum(s.side)}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">{fmtNum(s.ball_speed)}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">{fmtNum(clubSpd)}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">{fmtNum(s.launch_angle)}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">{fmtNum(s.back_spin)}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">{fmtNum(s.side_spin)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* =======================
   Dispersion Plot
======================= */

function DispersionPlot({
  shots,
  selected,
  hovered,
  onHover,
}: {
  shots: ShotRow[];
  selected: Set<string>;
  hovered: string | null;
  onHover: (id: string | null) => void;
}) {
  const W = 900;
  const H = 360;
  const PAD = 40;

  const pts = shots.filter((s) => typeof s.side === "number" && typeof s.carry === "number");

  const xMax = Math.max(20, ...pts.map((p) => Math.abs(p.side!)));
  const yMax = Math.max(50, ...pts.map((p) => p.carry!));

  const sx = (x: number) => PAD + ((x + xMax) / (xMax * 2)) * (W - PAD * 2);
  const sy = (y: number) => H - PAD - (y / yMax) * (H - PAD * 2);

  const hasSelection = selected.size > 0;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#333" />
      <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#333" />
      <line x1={sx(0)} y1={PAD} x2={sx(0)} y2={H - PAD} stroke="#222" />

      {pts.map((p) => {
        const isSel = selected.has(p.id);
        const isHover = hovered === p.id;

        // Single dot per shot; style changes prevent flicker/duplicate-dot feeling.
        const r = isHover ? 8 : isSel ? 6 : 4;
        const fill = isHover ? "#ff6b6b" : isSel ? "#ff6b6b" : "#9cf";
        const opacity = isHover || isSel ? 1 : hasSelection ? 0.2 : 0.85;

        return (
          <circle
            key={p.id}
            cx={sx(p.side!)}
            cy={sy(p.carry!)}
            r={r}
            fill={fill}
            opacity={opacity}
            onMouseEnter={() => onHover(p.id)}
            onMouseLeave={() => onHover(null)}
          />
        );
      })}
    </svg>
  );
}
