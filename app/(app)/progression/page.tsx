"use client";

import { useEffect, useMemo, useState } from "react";

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_ORIGIN || "").replace(/\/$/, "");
const apiUrl = (p: string) => `${API_ORIGIN}${p}`;

type ActivePlanResponse = {
  ok: boolean;
  has_active_plan?: boolean;
  active_plan3m_id?: string | null;
  active_plan6m_id?: string | null;
  plan?: any | null; // coaching_versions row
  error?: string;
};

type GuidanceRow = {
  id: string;
  week_start: number;
  week_end: number;
  title: string;
  rationale: string;
  proposed_changes: any;
  created_at: string;
  created_by: string;
};

type GuidanceDecision = {
  guidance_id: string;
  decision: "accepted" | "declined";
  created_at: string;
  note?: string | null;
};

type GuidanceReadResponse = {
  ok: boolean;
  has_active_plan: boolean;
  active_plan_id: string | null;
  guidance: GuidanceRow[];
  decisions_by_guidance_id: Record<string, GuidanceDecision | null>;
  error?: string;
};

type UserSafePlanDisplay = {
    headline?: string;
    summary?: string | string[];
    success_criteria?: string | string[];

    // Common variants we may receive in display (UI-only tolerance, no meta)
    themes?: any;       // array of strings or objects
    focus_areas?: any;
    months?: any;
    phases?: any;

    weeks?: any;
    weekly_plan?: any;
};


function asStringArray(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  return [String(v)].filter(Boolean);
}

function isPlainObject(v: any): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function pickFirstString(obj: any, keys: string[]): string | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

function normalizeThemes(raw: any): Array<{ title: string; why?: string; how?: string }> {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((t: any, idx: number) => {
      if (typeof t === "string") return { title: t };
      if (isPlainObject(t)) {
        const title =
          pickFirstString(t, ["theme_title", "title", "name", "label", "heading"]) || `Theme ${idx + 1}`;
        const why = pickFirstString(t, ["why_it_matters", "why", "rationale"]);
        const how = pickFirstString(t, ["how_to_work_on_it", "how", "method"]);
        return { title, why: why || undefined, how: how || undefined };
      }
      return { title: `Theme ${idx + 1}` };
    })
    .filter((x) => !!x.title);
}

function normalizeMonths(raw: any): Array<{
  title: string;
  focus: string[];
  keyActions: string[];
  sessionStructure: string[];
  checkpoints: string[];
  drills: string[];
  constraints: string[];
}> {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((m: any, idx: number) => {
    if (typeof m === "string") {
      return {
        title: `Month ${idx + 1}`,
        focus: [m],
        keyActions: [],
        sessionStructure: [],
        checkpoints: [],
        drills: [],
        constraints: [],
      };
    }
    if (isPlainObject(m)) {
      const title =
        pickFirstString(m, ["title", "month_title", "name", "label", "heading"]) || `Month ${idx + 1}`;
      const focus = asStringArray(m.focus ?? m.month_focus ?? m.objective ?? m.goal);
      const keyActions = asStringArray(m.key_actions ?? m.actions ?? m.tasks ?? m.priorities);
      const sessionStructure = asStringArray(m.session_structure ?? m.structure ?? m.schedule);
      const checkpoints = asStringArray(m.checkpoints ?? m.checkpoint ?? m.milestones);
      const drills = asStringArray(m.drills ?? m.drill);
      const constraints = asStringArray(m.constraints ?? m.constraint);
      return {
        title,
        focus,
        keyActions,
        sessionStructure,
        checkpoints,
        drills,
        constraints,
      };
    }
    return {
      title: `Month ${idx + 1}`,
      focus: [],
      keyActions: [],
      sessionStructure: [],
      checkpoints: [],
      drills: [],
      constraints: [],
    };
  });
}


type WeekV11 = {
  week_number: number;
  title: string;
  min_sessions: number;
  clubs: string[];
  aim: string;
  drills: string[];
  constraints: string[];
  checkpoints: string[];
  success_criteria: string[];
  date_window?: { start?: string; end?: string };
  progress_metrics?: Array<{ metric_id: string; label?: string; unit?: string; direction?: "increase" | "decrease" | "maintain"; target?: number | null }>;
};

function normalizeWeeksV11(raw: any): WeekV11[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: WeekV11[] = [];
  for (let i = 0; i < arr.length; i++) {
    const w: any = arr[i];
    if (!isPlainObject(w)) continue;

    const week_number =
      typeof w.week_number === "number"
        ? w.week_number
        : typeof w.week === "number"
          ? w.week
          : typeof w.weekIndex === "number"
            ? w.weekIndex
            : i + 1;

    // Detect v1.1-style week: min_sessions + aim + drills are the key signals
    const hasV11Signals =
      typeof w.min_sessions === "number" ||
      typeof w.aim === "string" ||
      Array.isArray(w.clubs) ||
      Array.isArray(w.drills);

    if (!hasV11Signals) continue;

    const title =
      pickFirstString(w, ["title", "week_title", "name", "label", "heading"]) ||
      `Week ${week_number}`;

    const date_window = isPlainObject(w.date_window) ? w.date_window : undefined;

    out.push({
      week_number,
      title,
      min_sessions: typeof w.min_sessions === "number" ? w.min_sessions : 0,
      clubs: (Array.isArray(w.clubs) ? w.clubs : []).map((c: any) => String(c)).filter(Boolean),
      aim: pickFirstString(w, ["aim", "focus", "objective"]) || "",
      drills: asStringArray(w.drills),
      constraints: asStringArray(w.constraints),
      checkpoints: asStringArray(w.checkpoints),
      success_criteria: asStringArray(w.success_criteria),
      date_window: date_window as any,
      progress_metrics: Array.isArray(w.progress_metrics) ? w.progress_metrics : undefined,
    });
  }
  return out.sort((a, b) => a.week_number - b.week_number);
}

type V11AppliedChangeSummary = {
    week_number: number;
    set?: Record<string, any>;
    add?: Record<string, any>;
    remove?: Record<string, any>;
};

function summarizeAppliedChange(ch: any): V11AppliedChangeSummary | null {
    if (!isPlainObject(ch)) return null;
    const week_number = typeof ch.week_number === "number" ? ch.week_number : null;
    if (!week_number) return null;
    const set = isPlainObject(ch.set) ? ch.set : undefined;
    const add = isPlainObject(ch.add) ? ch.add : undefined;
    const remove = isPlainObject(ch.remove) ? ch.remove : undefined;
    return { week_number, set, add, remove };
}

function getLatestAcceptedChangesByWeek(
    guidanceData: GuidanceReadResponse | null | undefined
): Record<number, { guidance_id: string; changes: any[] }> {
    const out: Record<number, { guidance_id: string; changes: any[] }> = {};
    if (!guidanceData?.guidance || !guidanceData?.decisions_by_guidance_id) return out;

    // newest-first
    const sorted = [...guidanceData.guidance].sort((a, b) =>
        a.created_at > b.created_at ? -1 : a.created_at < b.created_at ? 1 : 0
    );

    for (const g of sorted) {
        const d = guidanceData.decisions_by_guidance_id[g.id];
        if (!d || d.decision !== "accepted") continue;

        const changes = Array.isArray(g.proposed_changes?.changes) ? g.proposed_changes.changes : [];
        for (let wk = g.week_start; wk <= g.week_end; wk++) {
            if (out[wk]) continue; // latest accepted wins
            out[wk] = { guidance_id: g.id, changes };
        }
    }
    return out;
}

function applyChangesToWeekV11(base: WeekV11, changes: any[]): { week: WeekV11; applied: V11AppliedChangeSummary[] } {
    const applied: V11AppliedChangeSummary[] = [];
    let w: WeekV11 = { ...base };

    for (const raw of changes) {
        const ch = summarizeAppliedChange(raw);
        if (!ch || ch.week_number !== base.week_number) continue;

        // set scalars
        if (ch.set) {
            for (const [k, v] of Object.entries(ch.set)) {
                if (k === "min_sessions" && typeof v === "number") w.min_sessions = v;
                if (k === "aim" && typeof v === "string") w.aim = v;
                if (k === "title" && typeof v === "string") w.title = v;
            }
        }

        // add/remove arrays
        const add = ch.add ?? {};
        const remove = ch.remove ?? {};
        const applyArray = (
            key: keyof Pick<WeekV11, "drills" | "constraints" | "checkpoints" | "clubs" | "success_criteria">
        ) => {
            const baseArr = Array.isArray((w as any)[key]) ? ([...(w as any)[key]] as string[]) : [];
            const toAdd = asStringArray((add as any)[key]);
            const toRemove = asStringArray((remove as any)[key]);

            let next = baseArr.filter((x) => !toRemove.includes(x));
            for (const item of toAdd) if (!next.includes(item)) next.push(item);
            (w as any)[key] = next;
        };

        applyArray("drills");
        applyArray("constraints");
        applyArray("checkpoints");
        applyArray("clubs");
        applyArray("success_criteria");

        applied.push(ch);
    }

    return { week: w, applied };
}


type WeekStatus = {
  week_number: number;
  sessions_count: number;
  min_sessions: number;
  complete: boolean;
};

type JournalEntry = {
  id: string;
  created_at: string;
  entry: string;
};

function normalizeWeeks(raw: any): Array<{
  title: string;
  month: number | null;
  goal: string[];
  keyActions: string[];
  drills: string[];
  constraints: string[];
  checkpoints: string[];
}> {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((w: any, idx: number) => {
    if (typeof w === "string") {
      return { title: `Week ${idx + 1}`, month: null, goal: [w], keyActions: [], drills: [], constraints: [], checkpoints: [] };
    }
    if (isPlainObject(w)) {
      const title =
        pickFirstString(w, ["title", "week_title", "name", "label", "heading"]) ||
        (typeof w.week_number === "number" ? `Week ${w.week_number}` : `Week ${idx + 1}`);
      const month = typeof w.month === "number" ? w.month : (typeof w.month_number === "number" ? w.month_number : null);
      const goal = asStringArray(w.week_goal ?? w.goal ?? w.objective);
      const keyActions = asStringArray(w.key_actions ?? w.actions ?? w.tasks);
      const drills = asStringArray(w.drills ?? w.drill);
      const constraints = asStringArray(w.constraints ?? w.constraint);
      const checkpoints = asStringArray(w.checkpoints ?? w.checkpoint ?? w.milestones);
      return { title, month, goal, keyActions, drills, constraints, checkpoints };
    }
    return { title: `Week ${idx + 1}`, month: null, goal: [], keyActions: [], drills: [], constraints: [], checkpoints: [] };
  });
}

/**
 * Strict extraction:
 * - Prefer content_json.display (explicit user-safe surface).
 * - Never surface content_json.metadata or row-level fields.
 */
function getUserSafePlanDisplay(planRow: any): { display: UserSafePlanDisplay | null } {
  if (!isPlainObject(planRow)) return { display: null };

  const content = isPlainObject(planRow.content_json) ? planRow.content_json : null;
  if (!content) return { display: null };

  if (isPlainObject(content.display)) return { display: content.display as UserSafePlanDisplay };

  // Whitelist fallback (still safe; no meta)
  const allowed: UserSafePlanDisplay = {};
  for (const k of ["headline", "summary", "success_criteria", "themes", "focus_areas", "months", "phases", "weeks", "weekly_plan"] as const) {
    if (k in content) (allowed as any)[k] = (content as any)[k];
  }
  const hasAny = Object.keys(allowed).length > 0;
  return { display: hasAny ? allowed : null };
}


function StatusPill({ complete, label }: { complete: boolean; label: string }) {
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs " +
        (complete
          ? "border border-emerald-700/40 bg-emerald-900/20 text-emerald-300"
          : "border border-neutral-800 bg-neutral-950 text-neutral-300")
      }
    >
      {label}
    </span>
  );
}

function WeekFirstPlan({
    planKind,
    guidanceData,
    activePlanId,
    headline,
    summaryLines,
    successLines,
    weeks,
}: {
    planKind: "plan3m" | "plan6m";
    guidanceData?: GuidanceReadResponse | null;
    activePlanId: string | null;
    headline: string;
    summaryLines: string[];
    successLines: string[];
    weeks: WeekV11[];
 }) {
    

  const [selectedWeek, setSelectedWeek] = useState<number>(weeks[0]?.week_number ?? 1);
  const [weekStatus, setWeekStatus] = useState<Record<number, WeekStatus>>({});
  const [statusLoading, setStatusLoading] = useState<boolean>(false);

  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [journalLoading, setJournalLoading] = useState<boolean>(false);
  const [journalDraft, setJournalDraft] = useState<string>("");

  const activeWeek = useMemo(() => weeks.find((w) => w.week_number === selectedWeek) ?? weeks[0], [weeks, selectedWeek]);
    const acceptedByWeek = useMemo(() => getLatestAcceptedChangesByWeek(guidanceData ?? null), [guidanceData]);

    const merged = useMemo(() => {
        const wkNum = activeWeek?.week_number ?? selectedWeek;
        const info = acceptedByWeek[wkNum];
        if (!activeWeek || !info) return { week: activeWeek, applied: [] as V11AppliedChangeSummary[] };
        return applyChangesToWeekV11(activeWeek, info.changes);
    }, [activeWeek, acceptedByWeek, selectedWeek]);

    const weekIsAdjusted = !!acceptedByWeek[activeWeek?.week_number ?? selectedWeek];
    const week = merged.week;
    const appliedChanges = merged.applied;

  useEffect(() => {
    if (planKind !== "plan3m") return;
    // Week completion status (SQL-truthful). Server-only.
    let cancelled = false;
    (async () => {
      try {
        setStatusLoading(true);
        const res = await fetch(apiUrl("/api/progress/plan3m/week-status"), { cache: "no-store" });
        const j = await res.json();
        if (cancelled) return;
        if (j?.ok && Array.isArray(j.weeks)) {
          const map: Record<number, WeekStatus> = {};
          for (const w of j.weeks) {
            if (typeof w?.week_number === "number") map[w.week_number] = w;
          }
          setWeekStatus(map);
        }
      } catch {
        // ignore - UI stays neutral
      } finally {
        if (!cancelled) setStatusLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activePlanId]);

  useEffect(() => {
    if (planKind !== "plan3m") return;
    // Journal read for selected week
    let cancelled = false;
    (async () => {
      try {
        setJournalLoading(true);
        const res = await fetch(`/api/progress/plan3m/journal?week_number=${selectedWeek}`, { cache: "no-store" });
        const j = await res.json();
        if (cancelled) return;
        if (j?.ok) {
          setJournal(Array.isArray(j.entries) ? j.entries : []);
          setJournalDraft("");
        }
      } catch {
        if (!cancelled) setJournal([]);
      } finally {
        if (!cancelled) setJournalLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activePlanId, selectedWeek]);

  async function saveJournal() {
    const entry = journalDraft.trim();
    if (!entry) return;
    try {
      const res = await fetch(apiUrl("/api/progress/plan3m/journal"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ week_number: selectedWeek, entry }),
      });
      const j = await res.json();
      if (j?.ok) {
        setJournal(Array.isArray(j.entries) ? j.entries : journal);
        setJournalDraft("");
      }
    } catch {
      // ignore
    }
  }

  return (
    <div className="mt-4 space-y-5">
      {/* Overview */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
        <div className="text-base font-semibold text-neutral-100">{headline}</div>

        {summaryLines.length > 0 && (
          <div className="mt-3">
            <SectionTitle>Overview</SectionTitle>
            <TextBlock value={summaryLines} />
          </div>
        )}

        {successLines.length > 0 && (
          <div className="mt-4">
            <SectionTitle>Success criteria</SectionTitle>
            <BulletList items={successLines} />
          </div>
        )}
      </div>

      {/* Week Tabs */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
        <div className="flex flex-wrap gap-2">
          {weeks.map((w) => {
            const st = weekStatus[w.week_number];
            const complete = !!st?.complete;
            const isActive = w.week_number === selectedWeek;
            return (
              <button
                key={w.week_number}
                type="button"
                onClick={() => setSelectedWeek(w.week_number)}
                className={
                  "rounded-full px-3 py-1.5 text-xs transition " +
                  (isActive
                    ? "bg-neutral-100 text-neutral-900"
                    : complete
                      ? "border border-emerald-700/40 bg-emerald-900/10 text-emerald-200"
                      : "border border-neutral-800 bg-neutral-950 text-neutral-200 hover:bg-neutral-900")
                }
                title={complete ? "Completed (based on sessions uploaded in this week window)" : "Not completed yet"}
              >
                <span>Week {w.week_number}</span>
                {acceptedByWeek[w.week_number] ? (
                    <span className="ml-2 rounded-full border border-indigo-700/40 bg-indigo-900/20 px-2 py-0.5 text-[10px] text-indigo-300">
                        Adjusted
                    </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Selected Week */}
        {week && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold text-neutral-100">{activeWeek.title}</div>
              {weekStatus[activeWeek.week_number] && (
                <StatusPill
                  complete={weekStatus[activeWeek.week_number].complete}
                  label={
                    weekStatus[activeWeek.week_number].complete
                      ? `Complete (${weekStatus[activeWeek.week_number].sessions_count}/${weekStatus[activeWeek.week_number].min_sessions})`
                      : `In progress (${weekStatus[activeWeek.week_number].sessions_count}/${weekStatus[activeWeek.week_number].min_sessions})`
                  }
                />
              )}
              {statusLoading && <span className="text-xs text-neutral-500">checking…</span>}
              {activeWeek.date_window?.start && activeWeek.date_window?.end && (
                <span className="text-xs text-neutral-500">
                  {activeWeek.date_window.start} → {activeWeek.date_window.end}
                </span>
              )}
            </div>

            {weekIsAdjusted && appliedChanges.length > 0 && (
                <div className="rounded-xl border border-indigo-700/30 bg-indigo-950/20 p-3">
                    <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-indigo-200">Applied changes</div>
                        <span className="text-[11px] text-indigo-300/80">overlay — base plan unchanged</span>
                    </div>

                    <div className="mt-2 space-y-2 text-sm text-neutral-200">
                        {appliedChanges.map((ch, idx) => (
                            <div key={idx} className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-2">
                                {ch.set && (
                                    <div className="text-neutral-200">
                                        <span className="text-neutral-400">Overrides:</span>{" "}
                                        {Object.entries(ch.set).map(([k, v]) => (
                                            <span key={k} className="mr-2 inline-flex items-center gap-1">
                                                <span className="text-neutral-500">{k}</span>
                                                <span className="text-neutral-100">{String(v)}</span>
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {ch.add && Object.keys(ch.add).length > 0 && (
                                    <div className="mt-1 text-neutral-200">
                                        <span className="text-neutral-400">Added:</span>{" "}
                                        {Object.entries(ch.add).map(([k, v]) => (
                                            <span key={k} className="mr-2">
                                                <span className="text-neutral-500">{k}</span>: {asStringArray(v).join("; ")}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {ch.remove && Object.keys(ch.remove).length > 0 && (
                                    <div className="mt-1 text-neutral-200">
                                        <span className="text-neutral-400">Removed:</span>{" "}
                                        {Object.entries(ch.remove).map(([k, v]) => (
                                            <span key={k} className="mr-2">
                                                <span className="text-neutral-500">{k}</span>: {asStringArray(v).join("; ")}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}


            {/* Compact instruction cards */}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                <SectionTitle>Minimum sessions</SectionTitle>
                <div className="mt-2 text-sm text-neutral-200">{activeWeek.min_sessions || 0}</div>
              </div>
              <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                <SectionTitle>Clubs to hit</SectionTitle>
                <div className="mt-2 text-sm text-neutral-200">
                  {activeWeek.clubs.length ? activeWeek.clubs.join(", ") : "—"}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
              <SectionTitle>Aim</SectionTitle>
              <div className="mt-2 text-sm text-neutral-200">{activeWeek.aim || "—"}</div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                <SectionTitle>Drills</SectionTitle>
                <BulletList items={activeWeek.drills} />
              </div>
              <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                <SectionTitle>Constraints</SectionTitle>
                <BulletList items={activeWeek.constraints} />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                <SectionTitle>Checkpoints</SectionTitle>
                <BulletList items={activeWeek.checkpoints} />
              </div>
              <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                <SectionTitle>Success criteria</SectionTitle>
                <BulletList items={activeWeek.success_criteria} />
              </div>
            </div>

            {/* Journal */}
            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
              <div className="flex items-center justify-between">
                <SectionTitle>Journal</SectionTitle>
                {journalLoading && <span className="text-xs text-neutral-500">loading…</span>}
              </div>

              <div className="mt-3 space-y-3">
                <textarea
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-200 outline-none focus:border-neutral-700"
                  rows={3}
                  value={journalDraft}
                  onChange={(e) => setJournalDraft(e.target.value)}
                  placeholder="Quick note for this week… what worked, what didn’t, what to change next time."
                />
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={saveJournal}
                    disabled={!journalDraft.trim()}
                    className="rounded-lg bg-neutral-100 px-3 py-2 text-xs font-semibold text-neutral-900 disabled:opacity-40"
                  >
                    Save note
                  </button>
                </div>

                {journal.length > 0 ? (
                  <div className="space-y-2">
                    {journal.map((e) => (
                      <div key={e.id} className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
                        <div className="text-xs text-neutral-500">{new Date(e.created_at).toLocaleString()}</div>
                        <div className="mt-1 text-sm text-neutral-200 whitespace-pre-wrap">{e.entry}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-neutral-500">No journal entries yet for this week.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-200">
      {items.map((t, i) => (
        <li key={`${i}-${t.slice(0, 24)}`}>{t}</li>
      ))}
    </ul>
  );
}

function TextBlock({ value }: { value: any }) {
  const lines = asStringArray(value);
  if (!lines.length) return null;
  return (
    <div className="mt-2 space-y-2 text-sm text-neutral-200">
      {lines.map((l, i) => (
        <p key={`${i}-${l.slice(0, 24)}`}>{l}</p>
      ))}
    </div>
  );
}

function SectionTitle({ children }: { children: any }) {
  return <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{children}</div>;
}

function PlanRenderer({ display, activePlanId, planKind, guidanceData }: { display: UserSafePlanDisplay; activePlanId?: string | null; planKind?: "plan3m" | "plan6m"; guidanceData?: GuidanceReadResponse | null }) {
  const headline = display.headline ? String(display.headline) : "Your 3‑Month Plan";
  const summaryLines = asStringArray(display.summary);
  const successLines = asStringArray(display.success_criteria);

  // Tolerant mapping for display variants (UI-only; no meta)
  const themes = normalizeThemes(display.themes ?? display.focus_areas ?? []);
  const monthsRaw = display.months ?? display.phases ?? [];
  const months = normalizeMonths(monthsRaw);
  const weeksRaw = display.weeks ?? display.weekly_plan ?? [];
  const weeksV11 = normalizeWeeksV11(weeksRaw);

  const weeks = normalizeWeeks(weeksRaw);

  const weeksByMonth: Record<string, typeof weeks> = { "1": [], "2": [], "3": [], other: [] };
  for (const w of weeks) {
    if (w.month === 1 || w.month === 2 || w.month === 3) weeksByMonth[String(w.month)].push(w);
    else weeksByMonth.other.push(w);
  }

  const hasCore =
    summaryLines.length > 0 ||
    successLines.length > 0 ||
    themes.length > 0 ||
    months.length > 0 ||
    weeks.length > 0;

  
// Prefer Week-first (plan3m_v1.1) renderer when weeks have v1.1 signals.
if (weeksV11.length > 0) {
  return (
    <WeekFirstPlan
        planKind={planKind ?? "plan3m"}
        guidanceData={guidanceData ?? null}
        activePlanId={activePlanId ?? null}
        headline={headline}
        summaryLines={summaryLines}
        successLines={successLines}
        weeks={weeksV11}
    />

  );
}

return (
    <div className="mt-4 space-y-5">
      {/* Overview */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
        <div className="text-base font-semibold text-neutral-100">{headline}</div>

        {summaryLines.length > 0 && (
          <div className="mt-3">
            <SectionTitle>Summary</SectionTitle>
            <TextBlock value={summaryLines} />
          </div>
        )}

        {successLines.length > 0 && (
          <div className="mt-4">
            <SectionTitle>Success criteria</SectionTitle>
            <BulletList items={successLines} />
          </div>
        )}
      </div>

      {/* Themes */}
      {themes.length > 0 && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
          <SectionTitle>Themes</SectionTitle>
          <div className="mt-3 space-y-3">
            {themes.map((t, idx) => (
              <div key={idx} className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                <div className="text-sm font-semibold text-neutral-100">{t.title}</div>
                {t.why && (
                  <div className="mt-2 text-sm text-neutral-200">
                    <span className="text-neutral-400">Why it matters: </span>
                    {t.why}
                  </div>
                )}
                {t.how && (
                  <div className="mt-2 text-sm text-neutral-200">
                    <span className="text-neutral-400">How to work on it: </span>
                    {t.how}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Months */}
      {months.length > 0 && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
          <SectionTitle>Months</SectionTitle>
          <div className="mt-3 space-y-3">
            {months.map((m, idx) => {
              const monthWeeks = weeksByMonth[String(idx + 1)] || [];
              return (
                <details key={idx} className="rounded-lg border border-neutral-800 bg-neutral-950" open>
                  <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-neutral-100">
                    {m.title}
                    <span className="ml-2 text-xs font-normal text-neutral-500">(click to collapse)</span>
                  </summary>
                  <div className="border-t border-neutral-800 p-4">
                    {m.focus.length > 0 && (
                      <div>
                        <SectionTitle>Focus</SectionTitle>
                        <TextBlock value={m.focus} />
                      </div>
                    )}

                    {m.keyActions.length > 0 && (
                      <div className="mt-4">
                        <SectionTitle>Key actions</SectionTitle>
                        <BulletList items={m.keyActions} />
                      </div>
                    )}

                    {m.sessionStructure.length > 0 && (
                      <div className="mt-4">
                        <SectionTitle>Session structure</SectionTitle>
                        <TextBlock value={m.sessionStructure} />
                      </div>
                    )}

                    {m.checkpoints.length > 0 && (
                      <div className="mt-4">
                        <SectionTitle>Checkpoints</SectionTitle>
                        <BulletList items={m.checkpoints} />
                      </div>
                    )}

                    {/* Optional extras */}
                    {(m.drills.length > 0 || m.constraints.length > 0) && (
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {m.drills.length > 0 && (
                          <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                            <SectionTitle>Drills</SectionTitle>
                            <BulletList items={m.drills} />
                          </div>
                        )}
                        {m.constraints.length > 0 && (
                          <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                            <SectionTitle>Constraints</SectionTitle>
                            <BulletList items={m.constraints} />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Weeks (progressive disclosure) */}
                    {monthWeeks.length > 0 && (
                      <div className="mt-5">
                        <SectionTitle>Weeks</SectionTitle>
                        <div className="mt-2 space-y-2">
                          {monthWeeks.map((w, wIdx) => (
                            <details key={wIdx} className="rounded-lg border border-neutral-800 bg-neutral-950/60">
                              <summary className="cursor-pointer select-none px-3 py-2 text-sm text-neutral-200">
                                {w.title}
                              </summary>
                              <div className="border-t border-neutral-800 p-3">
                                {w.goal.length > 0 && (
                                  <div>
                                    <SectionTitle>Goal</SectionTitle>
                                    <TextBlock value={w.goal} />
                                  </div>
                                )}

                                {w.keyActions.length > 0 && (
                                  <div className="mt-3">
                                    <SectionTitle>Key actions</SectionTitle>
                                    <BulletList items={w.keyActions} />
                                  </div>
                                )}

                                {(w.drills.length > 0 || w.constraints.length > 0 || w.checkpoints.length > 0) && (
                                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                                    {w.drills.length > 0 && (
                                      <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-2">
                                        <SectionTitle>Drills</SectionTitle>
                                        <BulletList items={w.drills} />
                                      </div>
                                    )}
                                    {w.constraints.length > 0 && (
                                      <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-2">
                                        <SectionTitle>Constraints</SectionTitle>
                                        <BulletList items={w.constraints} />
                                      </div>
                                    )}
                                    {w.checkpoints.length > 0 && (
                                      <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-2">
                                        <SectionTitle>Checkpoints</SectionTitle>
                                        <BulletList items={w.checkpoints} />
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </details>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>

          {weeksByMonth.other.length > 0 && (
            <div className="mt-5 rounded-lg border border-neutral-800 bg-neutral-950 p-4">
              <SectionTitle>Additional weeks</SectionTitle>
              <div className="mt-2 space-y-2">
                {weeksByMonth.other.map((w, idx) => (
                  <div key={idx} className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
                    <div className="text-sm font-semibold text-neutral-100">{w.title}</div>
                    <TextBlock value={w.goal} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!hasCore && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 text-sm text-neutral-300">
          Your 3‑month plan is available, but it isn’t formatted for display yet.
        </div>
      )}
    </div>
  );
}

function decisionBadge(decision: GuidanceDecision | null | undefined): { label: string; cls: string } {
  if (!decision) return { label: "Pending", cls: "border-neutral-700 bg-neutral-900/40 text-neutral-200" };
  if (decision.decision === "accepted") return { label: "Applied", cls: "border-emerald-900 bg-emerald-950/30 text-emerald-200" };
  return { label: "Dismissed", cls: "border-neutral-700 bg-neutral-950 text-neutral-400" };
}

function summarizeProposedChanges(pc: any): string[] {
  if (!pc || typeof pc !== "object") return [];
  const out: string[] = [];

  const range = pc.week_range;
  if (range && typeof range === "object") {
    const s = range.start;
    const e = range.end;
    if (typeof s === "number" && typeof e === "number") out.push(`Weeks ${s}–${e}`);
  }

  const changes = Array.isArray(pc.changes) ? pc.changes : [];
  for (const c of changes) {
    if (!c || typeof c !== "object") continue;
    const w = typeof c.week_number === "number" ? c.week_number : null;
    const set = c.set && typeof c.set === "object" ? c.set : null;
    const add = c.add && typeof c.add === "object" ? c.add : null;
    const remove = c.remove && typeof c.remove === "object" ? c.remove : null;

    if (set && typeof set.min_sessions === "number" && w) out.push(`Week ${w}: set min sessions → ${set.min_sessions}`);
    if (set && typeof set.aim === "string" && set.aim.trim() && w) out.push(`Week ${w}: update aim`);
    if (add && Array.isArray(add.drills) && add.drills.length && w) out.push(`Week ${w}: add ${add.drills.length} drill(s)`);
    if (remove && Array.isArray(remove.drills) && remove.drills.length && w) out.push(`Week ${w}: remove ${remove.drills.length} drill(s)`);
    if (add && Array.isArray(add.constraints) && add.constraints.length && w) out.push(`Week ${w}: add ${add.constraints.length} constraint(s)`);
    if (add && Array.isArray(add.checkpoints) && add.checkpoints.length && w) out.push(`Week ${w}: add ${add.checkpoints.length} checkpoint(s)`);
  }

  const notes = typeof pc.coach_notes === "string" ? pc.coach_notes.trim() : "";
  if (notes) out.push(notes);

  // De-dupe while preserving order
  return Array.from(new Set(out)).slice(0, 8);
}

function CoachUpdatePanel(props: {
 onDecide?: (guidanceId: string, decision: "accepted" | "declined") => Promise<void>;
 decidingId?: string | null;
  planLabel: string;
  loading: boolean;
  error: string | null;
  data: GuidanceReadResponse | null;
}) {
  const { planLabel, loading, error, data, onDecide, decidingId } = props;

  const guidance = data?.guidance || [];
  const decisionsBy = data?.decisions_by_guidance_id || {};

  // New suggestion = latest item with no decision
  const newestUndecided = guidance.find((g) => !decisionsBy[g.id]);

  const history = guidance.filter((g) => g.id !== newestUndecided?.id);

  return (
    <aside className="w-full md:w-[380px] shrink-0">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Coach Update</div>
          <div className="text-xs text-neutral-500">{planLabel}</div>
        </div>

        {loading && (
          <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 text-sm text-neutral-300">
            Loading updates…
          </div>
        )}

        {!loading && error && (
          <div className="mt-4 rounded-xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">{error}</div>
        )}

        {!loading && !error && (!data?.has_active_plan || guidance.length === 0) && (
          <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 text-sm text-neutral-300">
            <div className="font-medium">No updates yet.</div>
            <div className="mt-1 text-neutral-400">Keep logging sessions to unlock personalised adjustments.</div>
          </div>
        )}

        {!loading && !error && data?.has_active_plan && newestUndecided && (
          <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-neutral-100">{newestUndecided.title}</div>
                <div className="mt-1 text-xs text-neutral-500">
                  Weeks {newestUndecided.week_start}–{newestUndecided.week_end}
                </div>
              </div>
              <span className="rounded-full border px-2 py-1 text-[11px] text-neutral-200 border-neutral-700 bg-neutral-900/40">
                New
              </span>
            </div>

            <div className="mt-3 text-sm text-neutral-200">{newestUndecided.rationale}</div>

            <ul className="mt-3 space-y-1 text-sm text-neutral-300">
              {summarizeProposedChanges(newestUndecided.proposed_changes).map((line, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-neutral-500" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex gap-2">
                <button
                    type="button"
                    disabled={!onDecide || decidingId === newestUndecided.id}
                    onClick={() => onDecide?.(newestUndecided.id, "accepted")}
                    className="flex-1 rounded-lg border border-emerald-700/40 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-900/30 disabled:opacity-50"
                >
                    {decidingId === newestUndecided.id ? "Applying…" : "Accept update"}
                </button>

                <button
                    type="button"
                    disabled={!onDecide || decidingId === newestUndecided.id}
                    onClick={() => onDecide?.(newestUndecided.id, "declined")}
                    className="flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900/40 disabled:opacity-50"
                >
                    Keep original
                </button>
            </div>

          </div>
        )}

        {!loading && !error && data?.has_active_plan && guidance.length > 0 && (
          <details className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
            <summary className="cursor-pointer select-none text-sm font-medium text-neutral-200">
              History
              <span className="ml-2 text-xs text-neutral-500">({history.length})</span>
            </summary>

            {history.length === 0 ? (
              <div className="mt-3 text-sm text-neutral-400">No prior updates.</div>
            ) : (
              <div className="mt-3 space-y-3">
                {history.map((g) => {
                  const decision = decisionsBy[g.id] ?? null;
                  const badge = decisionBadge(decision);
                  return (
                    <div key={g.id} className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-neutral-100">{g.title}</div>
                          <div className="mt-1 text-xs text-neutral-500">
                            Weeks {g.week_start}–{g.week_end}
                          </div>
                        </div>
                        <span className={["rounded-full border px-2 py-1 text-[11px]", badge.cls].join(" ")}>
                          {badge.label}
                        </span>
                      </div>

                      <div className="mt-2 text-sm text-neutral-300">{g.rationale}</div>

                      <ul className="mt-2 space-y-1 text-sm text-neutral-400">
                        {summarizeProposedChanges(g.proposed_changes).slice(0, 4).map((line, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-neutral-600" />
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </details>
        )}
      </div>
    </aside>
  );
}


export default function ProgressionPage() {
  const [tab, setTab] = useState<"3m" | "6m">("3m");

  const [planByTab, setPlanByTab] = useState<Record<"3m" | "6m", ActivePlanResponse | null>>({
    "3m": null,
    "6m": null,
  });
  const [planLoadingByTab, setPlanLoadingByTab] = useState<Record<"3m" | "6m", boolean>>({
    "3m": false,
    "6m": false,
  });
  const [planErrByTab, setPlanErrByTab] = useState<Record<"3m" | "6m", string | null>>({
    "3m": null,
    "6m": null,
  });

  const [guidanceByTab, setGuidanceByTab] = useState<Record<"3m" | "6m", GuidanceReadResponse | null>>({
    "3m": null,
    "6m": null,
  });
  const [guidanceLoadingByTab, setGuidanceLoadingByTab] = useState<Record<"3m" | "6m", boolean>>({
    "3m": false,
    "6m": false,
  });
  const [guidanceErrByTab, setGuidanceErrByTab] = useState<Record<"3m" | "6m", string | null>>({
    "3m": null,
    "6m": null,
  });

    const [decidingId, setDecidingId] = useState<string | null>(null);

    async function refreshGuidance(currentTab: "3m" | "6m") {
        const guidanceUrl = currentTab === "3m" ? "/api/progression/plan3m/guidance" : "/api/progression/plan6m/guidance";
        const res = await fetch(guidanceUrl, { method: "GET", credentials: "include", cache: "no-store" });
        const j = await res.json().catch(() => null);
        if (res.ok) setGuidanceByTab((p) => ({ ...p, [currentTab]: j }));
    }

    async function decideOnGuidance(guidanceId: string, decision: "accepted" | "declined") {
        setDecidingId(guidanceId);
        try {
            const res = await fetch(apiUrl("/api/progression/guidance/decide"), {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ guidance_id: guidanceId, decision }),
            });
            const j = await res.json().catch(() => null);
            if (!res.ok || !j?.ok) {
                setGuidanceErrByTab((p) => ({ ...p, [tab]: j?.error || `Decision failed (${res.status})` }));
                return;
            }
            await refreshGuidance(tab);
        } finally {
            setDecidingId(null);
        }
    }


  useEffect(() => {
    const ac = new AbortController();

    const planUrl = tab === "3m" ? "/api/coaching/plan3m/active" : "/api/coaching/plan6m/active";
    const guidanceUrl = tab === "3m" ? "/api/progression/plan3m/guidance" : "/api/progression/plan6m/guidance";

    (async () => {
      // PLAN
      setPlanLoadingByTab((p) => ({ ...p, [tab]: true }));
      setPlanErrByTab((p) => ({ ...p, [tab]: null }));

      // GUIDANCE
      setGuidanceLoadingByTab((p) => ({ ...p, [tab]: true }));
      setGuidanceErrByTab((p) => ({ ...p, [tab]: null }));

      try {
        const [planRes, guidanceRes] = await Promise.all([
          fetch(planUrl, { method: "GET", credentials: "include", signal: ac.signal }),
          fetch(guidanceUrl, { method: "GET", credentials: "include", signal: ac.signal }),
        ]);

        const planJson = (await planRes.json().catch(() => null)) as ActivePlanResponse | null;
        const guidanceJson = (await guidanceRes.json().catch(() => null)) as GuidanceReadResponse | null;

        if (!planRes.ok) {
          setPlanErrByTab((p) => ({ ...p, [tab]: planJson?.error || `Plan request failed (${planRes.status})` }));
          setPlanByTab((p) => ({ ...p, [tab]: null }));
        } else {
          setPlanByTab((p) => ({ ...p, [tab]: planJson }));
        }

        if (!guidanceRes.ok) {
          setGuidanceErrByTab((p) => ({
            ...p,
            [tab]: guidanceJson?.error || `Guidance request failed (${guidanceRes.status})`,
          }));
          setGuidanceByTab((p) => ({ ...p, [tab]: null }));
        } else {
          setGuidanceByTab((p) => ({ ...p, [tab]: guidanceJson }));
        }
      } catch (e: any) {
        if (e?.name !== "AbortError") {
          setPlanErrByTab((p) => ({ ...p, [tab]: e?.message || "Plan request failed" }));
          setGuidanceErrByTab((p) => ({ ...p, [tab]: e?.message || "Guidance request failed" }));
        }
      } finally {
        setPlanLoadingByTab((p) => ({ ...p, [tab]: false }));
        setGuidanceLoadingByTab((p) => ({ ...p, [tab]: false }));
      }
    })();

    return () => ac.abort();
  }, [tab]);

  const planData = planByTab[tab];
  const planLoading = planLoadingByTab[tab];
  const planErr = planErrByTab[tab];

  const guidanceData = guidanceByTab[tab];
  const guidanceLoading = guidanceLoadingByTab[tab];
  const guidanceErr = guidanceErrByTab[tab];

  const activePlanRow = planData?.plan ?? null;
  const { display: planDisplay } = useMemo(() => getUserSafePlanDisplay(activePlanRow), [activePlanRow]);

  const activePlanId =
    tab === "3m" ? (planData?.active_plan3m_id ?? null) : (planData?.active_plan6m_id ?? null);

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <div className="text-2xl font-semibold">Progression</div>
        <div className="mt-1 text-sm text-neutral-400">
          Strategic view — plans + evidence. Session coaching appears in session context, not here.
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setTab("3m")}
          className={[
            "rounded-xl border px-3 py-2 text-sm transition",
            tab === "3m"
              ? "border-neutral-600 bg-neutral-900/70 text-neutral-100"
              : "border-neutral-800 bg-neutral-950 text-neutral-300 hover:bg-neutral-900/40",
          ].join(" ")}
        >
          3‑Month Plan
        </button>
        <button
          onClick={() => setTab("6m")}
          className={[
            "rounded-xl border px-3 py-2 text-sm transition",
            tab === "6m"
              ? "border-neutral-600 bg-neutral-900/70 text-neutral-100"
              : "border-neutral-800 bg-neutral-950 text-neutral-300 hover:bg-neutral-900/40",
          ].join(" ")}
        >
          6‑Month Plan
        </button>
      </div>

      <div className="flex flex-col gap-6 md:flex-row">
        <main className="flex-1">
          {planLoading && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">Loading…</div>
          )}

          {planErr && (
            <div className="rounded-xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">{planErr}</div>
          )}

          {!planLoading && !planErr && (
            <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{tab === "3m" ? "Active 3‑Month Plan" : "Active 6‑Month Plan"}</div>
                <div className="text-xs text-neutral-500">read-only</div>
              </div>

              {planData?.has_active_plan ? (
                planDisplay ? (
                  <PlanRenderer
                    display={planDisplay}
                    activePlanId={activePlanId}
                    planKind={tab === "3m" ? "plan3m" : "plan6m"}
                    guidanceData={guidanceData}
                  />
                ) : (
                  <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 text-sm text-neutral-300">
                    <div className="font-medium">Plan available, but not formatted for display.</div>
                    <div className="mt-1 text-neutral-400">
                      This view will not show internal JSON. If the display payload is missing, we can update formatting on the next plan regen.
                    </div>
                  </div>
                )
              ) : (
                <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 text-sm text-neutral-300">
                  <div className="font-medium">No active plan yet.</div>
                  <div className="mt-1 text-neutral-400">This client needs an admin to activate a generated draft plan.</div>
                </div>
              )}
            </section>
          )}
        </main>

        <CoachUpdatePanel
            planLabel={tab === "3m" ? "3-Month" : "6-Month"}
            loading={guidanceLoading}
            error={guidanceErr}
            data={guidanceData}
            onDecide={decideOnGuidance}
            decidingId={decidingId}
        />
      </div>
    </div>
  );
}
