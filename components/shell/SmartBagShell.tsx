"use client";

import { useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api/http";

type TabKey = "overview" | "detail" | "leaderboard" | "customise";
type MishitsMode = "exclude" | "include";
type WindowDays = 30 | 60 | 90 | 180;

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "detail", label: "Detail" },
  { key: "leaderboard", label: "Leaderboard" },
  { key: "customise", label: "Customise Bag" },
];

const CLUB_ORDER: Record<string, number> = {
  // wedges
  LW: 10,
  SW: 20,
  GW: 30,
  AW: 35,
  PW: 40,

  // irons
  I9: 50,
  I8: 60,
  I7: 70,
  I6: 80,
  I5: 90,
  I4: 100,
  I3: 110,
  I2: 120,

  // hybrids
  H7: 130,
  H6: 135,
  H5: 140,
  H4: 145,
  H3: 150,
  H2: 155,

  // woods
  W9: 170,
  W7: 175,
  W5: 180,
  W4: 185,
  W3: 190,

  // driver / putter
  DR: 200,
  DRIVER: 200,
  PUTTER: 9998,
};

const CLUB_CHOICES: { key: string; label: string }[] = [
  { key: "DR", label: "Driver (DR)" },
  { key: "W3", label: "3 Wood (W3)" },
  { key: "W5", label: "5 Wood (W5)" },
  { key: "W7", label: "7 Wood (W7)" },
  { key: "H2", label: "2 Hybrid (H2)" },
  { key: "H3", label: "3 Hybrid (H3)" },
  { key: "H4", label: "4 Hybrid (H4)" },
  { key: "H5", label: "5 Hybrid (H5)" },
  { key: "I2", label: "2 Iron (I2)" },
  { key: "I3", label: "3 Iron (I3)" },
  { key: "I4", label: "4 Iron (I4)" },
  { key: "I5", label: "5 Iron (I5)" },
  { key: "I6", label: "6 Iron (I6)" },
  { key: "I7", label: "7 Iron (I7)" },
  { key: "I8", label: "8 Iron (I8)" },
  { key: "I9", label: "9 Iron (I9)" },
  { key: "PW", label: "Pitching Wedge (PW)" },
  { key: "GW", label: "Gap Wedge (GW)" },
  { key: "SW", label: "Sand Wedge (SW)" },
  { key: "LW", label: "Lob Wedge (LW)" },
  { key: "PUTTER", label: "Putter" },
];

const PRESET_TEMPLATES: { key: string; label: string; slots: string[] }[] = [
  {
    key: "std14",
    label: "Standard 14 (incl. putter)",
    slots: ["DR", "W3", "H3", "I4", "I5", "I6", "I7", "I8", "I9", "PW", "GW", "SW", "LW", "PUTTER"],
  },
  {
    key: "range_min",
    label: "Range / Minimal",
    slots: ["DR", "W3", "I4", "I6", "I7", "I8", "I9", "PW", "SW", "PUTTER"],
  },
  {
    key: "wedge_heavy",
    label: "Wedge-heavy",
    slots: ["DR", "W3", "H3", "I4", "I5", "I6", "I7", "I8", "I9", "PW", "AW", "GW", "SW", "LW", "PUTTER"],
  },
];

function normalizeClubKey(v: any): string {
  if (!v) return "";
  const s = String(v).trim().toUpperCase();
  if (s === "DRIVER") return "DR";
  const m = s.match(/^(\d+)\s*I$/);
  if (m) return `I${m[1]}`;
  const w = s.match(/^(\d+)\s*W$/);
  if (w) return `W${w[1]}`;
  const h = s.match(/^(\d+)\s*H$/);
  if (h) return `H${h[1]}`;
  return s;
}

function clubSortKey(clubKeyRaw: any): number {
  const key = normalizeClubKey(clubKeyRaw);
  if (key in CLUB_ORDER) return CLUB_ORDER[key];

  const iron = key.match(/^I(\d+)$/);
  if (iron) {
    const n = Number(iron[1]);
    if (Number.isFinite(n)) return 40 + (9 - n) * 10;
  }

  const wood = key.match(/^W(\d+)$/);
  if (wood) {
    const n = Number(wood[1]);
    if (Number.isFinite(n)) return 160 + (9 - n) * 5;
  }

  const hy = key.match(/^H(\d+)$/);
  if (hy) {
    const n = Number(hy[1]);
    if (Number.isFinite(n)) return 120 + (9 - n) * 5;
  }

  return 9999;
}

function fmt(n: any, digits = 1): string {
  if (n === null || n === undefined) return "—";
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return num.toFixed(digits);
}

function pickPercentile(obj: any, keys: string[]): number | null {
  if (!obj || typeof obj !== "object") return null;
  for (const k of keys) {
    const v = obj[k];
    const num = Number(v);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

function carryFromDistanceRangeJson(distanceRangeJson: any): number | null {
  const carry = distanceRangeJson?.carry ?? distanceRangeJson?.Carry;
  return pickPercentile(carry, ["p50", "mean", "avg", "p75", "p25", "p10"]);
}

function dispersionFromDispersionJson(dispersionJson: any): number | null {
  const offlineAbs = dispersionJson?.offline_abs ?? dispersionJson?.offlineAbs;
  const offline = dispersionJson?.offline ?? dispersionJson?.Offline;
  return (
    pickPercentile(offlineAbs, ["p50", "mean", "avg", "p75", "p25", "p10"]) ??
    pickPercentile(offline, ["std", "stdev", "p50", "mean", "avg"]) ??
    null
  );
}

type CustomClubRow = {
  slot: string;
  brand: string;
  model: string;
  shaft: string;
  notes: string;
};

function rowsFromSlots(slots: string[]): CustomClubRow[] {
  return slots.map((slot) => ({
    slot,
    brand: "",
    model: "",
    shaft: "",
    notes: "",
  }));
}

function emptyRow(slot = ""): CustomClubRow {
  return { slot, brand: "", model: "", shaft: "", notes: "" };
}

export default function SmartBagShell() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [windowDays, setWindowDays] = useState<WindowDays>(30);
  const [mishitsMode, setMishitsMode] = useState<MishitsMode>("exclude");

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // leaderboard
  const [lbRows, setLbRows] = useState<any[]>([]);
  const [lbLoading, setLbLoading] = useState(false);
  const [lbErr, setLbErr] = useState<string | null>(null);

  // Customise persistence
  const [bagName, setBagName] = useState<string>("");
  const [customRows, setCustomRows] = useState<CustomClubRow[]>(() =>
    rowsFromSlots(PRESET_TEMPLATES[0].slots)
  );
  const [customLoading, setCustomLoading] = useState(false);
  const [customErr, setCustomErr] = useState<string | null>(null);
  const [customSavedAt, setCustomSavedAt] = useState<string | null>(null);
  const [addClubKey, setAddClubKey] = useState<string>("");

  async function loadLatest(signal?: AbortSignal) {
    setLoading(true);
    setErr(null);

    try {
      const json = await apiFetch<any>("/api/bag/latest", {
        method: "POST",
        json: { window_days: windowDays, mishits_mode: mishitsMode },
        signal,
      });
      setData(json);
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setErr(e?.message || "Request failed");
        setData(null);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadLeaderboard(signal?: AbortSignal) {
    setLbLoading(true);
    setLbErr(null);

    try {
      const json = await apiFetch<any>("/api/bag/leaderboard", {
        method: "POST",
        json: { window_days: windowDays, mishits_mode: mishitsMode },
        signal,
      });
      setLbRows(json?.rows ?? []);
    } catch (e: any) {
      if (e?.name !== "AbortError") setLbErr(e?.message || "Request failed");
    } finally {
      setLbLoading(false);
    }
  }

  async function loadCustomise(signal?: AbortSignal) {
    setCustomLoading(true);
    setCustomErr(null);

    try {
      const json = await apiFetch<any>("/api/bag/customise", {
        method: "GET",
        signal,
      });

      const profile = json?.profile;
      const clubs = (json?.clubs ?? []) as any[];

      setBagName(profile?.bag_name ?? "");

      if (clubs.length > 0) {
        const rows = clubs
          .map((c) => ({
            slot: normalizeClubKey(c.slot),
            brand: c.brand ?? "",
            model: c.model ?? "",
            shaft: c.shaft ?? "",
            notes: c.notes ?? "",
          }))
          .filter((r) => r.slot);

        setCustomRows(rows.length ? rows : rowsFromSlots(PRESET_TEMPLATES[0].slots));
      } else {
        setCustomRows(rowsFromSlots(PRESET_TEMPLATES[0].slots));
      }

      setCustomSavedAt(null);
    } catch (e: any) {
      if (e?.name !== "AbortError") setCustomErr(e?.message || "Request failed");
    } finally {
      setCustomLoading(false);
    }
  }

  async function saveCustomise() {
    setCustomLoading(true);
    setCustomErr(null);

    try {
      const payload = {
        bag_name: bagName || null,
        clubs: customRows
          .map((r) => ({
            slot: normalizeClubKey(r.slot),
            brand: r.brand || null,
            model: r.model || null,
            shaft: r.shaft || null,
            notes: r.notes || null,
          }))
          .filter((r) => r.slot),
      };

      await apiFetch<any>("/api/bag/customise", {
        method: "POST",
        json: payload,
      });

      setCustomSavedAt(new Date().toLocaleString());
    } catch (e: any) {
      setCustomErr(e?.message || "Request failed");
    } finally {
      setCustomLoading(false);
    }
  }

  // Auto-load for overview + detail
  useEffect(() => {
    if (tab !== "overview" && tab !== "detail") return;
    const ctrl = new AbortController();
    void loadLatest(ctrl.signal);
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, windowDays, mishitsMode]);

  // Load leaderboard when tab opened (and on window/mishits change while on tab)
  useEffect(() => {
    if (tab !== "leaderboard") return;
    const ctrl = new AbortController();
    void loadLeaderboard(ctrl.signal);
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, windowDays, mishitsMode]);

  // Load customise when tab opened
  useEffect(() => {
    if (tab !== "customise") return;
    const ctrl = new AbortController();
    void loadCustomise(ctrl.signal);
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const clubsSorted = useMemo(() => {
    const clubs = data?.clubs ?? [];
    return [...clubs].sort((a: any, b: any) => clubSortKey(a?.club_key) - clubSortKey(b?.club_key));
  }, [data]);

  const presentClubKeys = useMemo(() => {
    const set = new Set<string>();
    for (const c of clubsSorted) set.add(normalizeClubKey(c?.club_key));
    return set;
  }, [clubsSorted]);

  const desiredSlots = useMemo(() => {
    const slots = customRows.map((r) => normalizeClubKey(r.slot)).filter(Boolean);
    return slots.length ? slots : PRESET_TEMPLATES[0].slots;
  }, [customRows]);

  const missingFromTable = useMemo(() => {
    const missing = desiredSlots.filter((k) => !presentClubKeys.has(k));
    return missing.sort((a, b) => clubSortKey(a) - clubSortKey(b));
  }, [desiredSlots, presentClubKeys]);

  const insights = useMemo(() => {
    const rows = clubsSorted
      .map((c: any) => {
        const club = normalizeClubKey(c?.club_key);
        const dispersion = dispersionFromDispersionJson(c?.dispersion_json);
        const conf = Number(c?.confidence_score);
        return {
          club,
          dispersion: dispersion ?? null,
          confidence: Number.isFinite(conf) ? conf : null,
        };
      })
      .filter((r) => r.club);

    const bestDisp = rows
      .filter((r) => r.dispersion !== null)
      .sort((a, b) => (a.dispersion as number) - (b.dispersion as number))[0];

    const worstDisp = rows
      .filter((r) => r.dispersion !== null)
      .sort((a, b) => (b.dispersion as number) - (a.dispersion as number))[0];

    const lowestConf = rows
      .filter((r) => r.confidence !== null)
      .sort((a, b) => (a.confidence as number) - (b.confidence as number))[0];

    return { bestDisp, worstDisp, lowestConf };
  }, [clubsSorted]);

  const headerControls = (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="rounded border px-3 py-2 text-sm"
        value={windowDays}
        onChange={(e) => setWindowDays(Number(e.target.value) as WindowDays)}
      >
        <option value={30}>30 days</option>
        <option value={60}>60 days</option>
        <option value={90}>90 days</option>
        <option value={180}>180 days</option>
      </select>

      <select
        className="rounded border px-3 py-2 text-sm"
        value={mishitsMode}
        onChange={(e) => setMishitsMode(e.target.value as MishitsMode)}
      >
        <option value="exclude">Mishits: exclude</option>
        <option value="include">Mishits: include</option>
      </select>

      <button className="rounded border px-3 py-2 text-sm" onClick={() => loadLatest()} type="button">
        Refresh
      </button>
    </div>
  );

  const body = useMemo(() => {
    switch (tab) {
      case "overview":
        return (
          <div className="space-y-3">
            {headerControls}

            {loading && <div className="text-sm">Loading…</div>}
            {err && <div className="text-sm text-red-600">{err}</div>}

            {data?.snapshot && (
              <div className="space-y-1 text-sm">
                <div>Bag score: {fmt(data.snapshot.bag_score)}</div>
                <div>Confidence: {fmt(data.snapshot.bag_confidence)}</div>
                <div>Clubs: {data.clubs.length}</div>
              </div>
            )}

            {data?.snapshot && (
              <div className="mt-2 rounded-lg border p-3 text-sm">
                <div className="font-medium">Quick takeaways</div>
                <div className="mt-2 space-y-1 text-muted-foreground">
                  {insights.bestDisp ? (
                    <div>
                      Tightest dispersion: <span className="text-foreground">{insights.bestDisp.club}</span>{" "}
                      ({fmt(insights.bestDisp.dispersion, 1)} yd)
                    </div>
                  ) : (
                    <div>Tightest dispersion: —</div>
                  )}
                  {insights.worstDisp ? (
                    <div>
                      Widest dispersion: <span className="text-foreground">{insights.worstDisp.club}</span>{" "}
                      ({fmt(insights.worstDisp.dispersion, 1)} yd)
                    </div>
                  ) : (
                    <div>Widest dispersion: —</div>
                  )}
                  {insights.lowestConf ? (
                    <div>
                      Lowest confidence: <span className="text-foreground">{insights.lowestConf.club}</span>{" "}
                      ({fmt(insights.lowestConf.confidence, 1)})
                    </div>
                  ) : (
                    <div>Lowest confidence: —</div>
                  )}
                </div>
              </div>
            )}

            {data?.snapshot && missingFromTable.length > 0 && (
              <div className="text-xs text-muted-foreground">
                Not shown yet (needs more shots): {missingFromTable.join(", ")}
              </div>
            )}

            {data && !data.snapshot && !loading && !err && (
              <div className="text-sm text-muted-foreground">
                No snapshot found for this window/mishits mode (run compute).
              </div>
            )}
          </div>
        );

      case "detail":
        return (
          <div className="space-y-3">
            {headerControls}

            {loading && <div className="text-sm">Loading…</div>}
            {err && <div className="text-sm text-red-600">{err}</div>}

            {data?.snapshot && (
              <div className="text-sm text-muted-foreground">
                Snapshot: {windowDays}d • {mishitsMode} • Clubs: {data.clubs.length}
              </div>
            )}

            {data?.snapshot && clubsSorted.length > 0 && (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="px-3 py-2 text-left">Club</th>
                      <th className="px-3 py-2 text-right">Samples</th>
                      <th className="px-3 py-2 text-right">Carry (p50)</th>
                      <th className="px-3 py-2 text-right">Dispersion</th>
                      <th className="px-3 py-2 text-right">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clubsSorted.map((c: any) => {
                      const clubLabel = normalizeClubKey(c.club_key) || "—";
                      const samples = c.shot_count_total ?? c.shot_count_ts ?? c.shot_count_us ?? null;
                      const carryP50 = carryFromDistanceRangeJson(c.distance_range_json);
                      const dispersion = dispersionFromDispersionJson(c.dispersion_json);
                      const confidence = c.confidence_score ?? c.confidence ?? null;

                      return (
                        <tr key={c.id} className="border-b last:border-0">
                          <td className="px-3 py-2">{clubLabel}</td>
                          <td className="px-3 py-2 text-right">{samples ?? "—"}</td>
                          <td className="px-3 py-2 text-right">{fmt(carryP50, 1)} yd</td>
                          <td className="px-3 py-2 text-right">{fmt(dispersion, 1)} yd</td>
                          <td className="px-3 py-2 text-right">{fmt(confidence, 1)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {missingFromTable.length > 0 && (
              <div className="text-xs text-muted-foreground">
                Not shown yet (needs more shots): {missingFromTable.join(", ")}
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              Note: clubs only appear once they meet the minimum sample threshold (min_samples_per_club at compute time).
            </div>
          </div>
        );

      case "leaderboard":
        return (
          <div className="space-y-3">
            {headerControls}

            <div className="text-sm text-muted-foreground">
              Leaderboard score = 70% dispersion tightness + 30% distance consistency.
            </div>

            {lbLoading && <div className="text-sm">Loading…</div>}
            {lbErr && <div className="text-sm text-red-600">{lbErr}</div>}

            {!lbLoading && !lbErr && lbRows.length === 0 && (
              <div className="text-sm text-muted-foreground">No rows yet (run compute + ensure enough samples).</div>
            )}

            {lbRows.length > 0 && (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="px-3 py-2 text-left">Rank</th>
                      <th className="px-3 py-2 text-left">Club</th>
                      <th className="px-3 py-2 text-right">Score</th>
                      <th className="px-3 py-2 text-right">Dispersion</th>
                      <th className="px-3 py-2 text-right">Carry spread (p90-p10)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lbRows.map((r: any, idx: number) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="px-3 py-2">{idx + 1}</td>
                        <td className="px-3 py-2">{normalizeClubKey(r.club_key) || "—"}</td>
                        <td className="px-3 py-2 text-right">{fmt(r.score, 3)}</td>
                        <td className="px-3 py-2 text-right">{fmt(r.dispersion, 1)} yd</td>
                        <td className="px-3 py-2 text-right">{fmt(r.distance_spread, 1)} yd</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );

      case "customise": {
        const existing = new Set(customRows.map((r) => normalizeClubKey(r.slot)).filter(Boolean));
        const availableToAdd = CLUB_CHOICES.filter((c) => !existing.has(c.key));

        return (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-muted-foreground">
                Save your actual bag so Smart Bag can personalise missing clubs + recommendations.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded border px-3 py-2 text-sm"
                  onClick={() => loadCustomise()}
                  disabled={customLoading}
                >
                  Reload
                </button>
                <button
                  type="button"
                  className="rounded border px-3 py-2 text-sm"
                  onClick={() => saveCustomise()}
                  disabled={customLoading}
                >
                  Save
                </button>
              </div>
            </div>

            {customLoading && <div className="text-sm">Loading…</div>}
            {customErr && <div className="text-sm text-red-600">{customErr}</div>}
            {customSavedAt && <div className="text-xs text-muted-foreground">Saved: {customSavedAt}</div>}

            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-muted-foreground">Bag name</label>
              <input
                className="w-64 rounded border px-2 py-1 text-sm"
                value={bagName}
                onChange={(e) => setBagName(e.target.value)}
                placeholder="e.g. Indoor set / Range set…"
              />

              <div className="ml-auto flex flex-wrap items-center gap-2">
                <label className="text-xs text-muted-foreground">Template</label>
                <select
                  className="rounded border px-3 py-2 text-sm"
                  onChange={(e) => {
                    const key = e.target.value;
                    const preset = PRESET_TEMPLATES.find((p) => p.key === key);
                    if (preset) setCustomRows(rowsFromSlots(preset.slots));
                  }}
                  defaultValue={PRESET_TEMPLATES[0].key}
                >
                  {PRESET_TEMPLATES.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  className="rounded border px-3 py-2 text-sm"
                  onClick={() => setCustomRows(rowsFromSlots(PRESET_TEMPLATES[0].slots))}
                >
                  Reset
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-muted-foreground">Add club</label>
              <select
                className="rounded border px-3 py-2 text-sm"
                value={addClubKey}
                onChange={(e) => setAddClubKey(e.target.value)}
              >
                <option value="">Select…</option>
                {availableToAdd.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="rounded border px-3 py-2 text-sm"
                onClick={() => {
                  if (!addClubKey) return;
                  setCustomRows((prev) => [...prev, emptyRow(addClubKey)]);
                  setAddClubKey("");
                }}
                disabled={!addClubKey}
              >
                Add
              </button>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-3 py-2 text-left">Club</th>
                    <th className="px-3 py-2 text-left">Brand</th>
                    <th className="px-3 py-2 text-left">Model</th>
                    <th className="px-3 py-2 text-left">Shaft</th>
                    <th className="px-3 py-2 text-left">Notes</th>
                    <th className="px-3 py-2 text-right"> </th>
                  </tr>
                </thead>
                <tbody>
                  {customRows
                    .slice()
                    .sort((a, b) => clubSortKey(a.slot) - clubSortKey(b.slot))
                    .map((row, idx) => (
                      <tr key={`${row.slot}-${idx}`} className="border-b last:border-0">
                        <td className="px-3 py-2">
                          <input
                            className="w-20 rounded border px-2 py-1 text-sm"
                            value={row.slot}
                            onChange={(e) => {
                              const v = e.target.value;
                              setCustomRows((prev) => prev.map((r, i) => (i === idx ? { ...r, slot: v } : r)));
                            }}
                            placeholder="I7"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="w-40 rounded border px-2 py-1 text-sm"
                            value={row.brand}
                            onChange={(e) => {
                              const v = e.target.value;
                              setCustomRows((prev) => prev.map((r, i) => (i === idx ? { ...r, brand: v } : r)));
                            }}
                            placeholder="Titleist…"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="w-52 rounded border px-2 py-1 text-sm"
                            value={row.model}
                            onChange={(e) => {
                              const v = e.target.value;
                              setCustomRows((prev) => prev.map((r, i) => (i === idx ? { ...r, model: v } : r)));
                            }}
                            placeholder="T200…"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="w-52 rounded border px-2 py-1 text-sm"
                            value={row.shaft}
                            onChange={(e) => {
                              const v = e.target.value;
                              setCustomRows((prev) => prev.map((r, i) => (i === idx ? { ...r, shaft: v } : r)));
                            }}
                            placeholder="Project X…"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="w-64 rounded border px-2 py-1 text-sm"
                            value={row.notes}
                            onChange={(e) => {
                              const v = e.target.value;
                              setCustomRows((prev) => prev.map((r, i) => (i === idx ? { ...r, notes: v } : r)));
                            }}
                            placeholder="Loft tweak / grip / etc…"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs"
                            onClick={() => setCustomRows((prev) => prev.filter((_, i) => i !== idx))}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="text-xs text-muted-foreground">
              Tip: use “Add club” for extra wedges/woods/hybrids. Saved clubs drive “missing clubs” in Overview/Detail.
            </div>
          </div>
        );
      }

      default:
        return null;
    }
  }, [
    tab,
    windowDays,
    mishitsMode,
    data,
    loading,
    err,
    clubsSorted,
    missingFromTable,
    insights,
    customRows,
    customLoading,
    customErr,
    customSavedAt,
    bagName,
    addClubKey,
    lbRows,
    lbLoading,
    lbErr,
  ]);

  return (
    <div className="min-h-[calc(100vh-0px)] w-full">
      <div className="mx-auto w-full max-w-6xl px-4 py-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Smart Bag</h1>
            <p className="text-sm text-muted-foreground">Your bag intelligence workspace (V1)</p>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Window: {windowDays}d</span>
            <span>•</span>
            <span>Mishits: {mishitsMode}</span>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={[
                "rounded-full border px-4 py-2 text-sm",
                tab === t.key ? "bg-foreground text-background" : "bg-background",
              ].join(" ")}
              type="button"
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-6 rounded-xl border p-4">
          <div className="text-sm">{body}</div>
        </div>
      </div>
    </div>
  );
}
