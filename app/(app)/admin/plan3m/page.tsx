"use client";

import { useEffect, useMemo, useState } from "react";

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_ORIGIN || "").replace(/\/$/, "");
const apiUrl = (p: string) => `${API_ORIGIN}${p}`;

type Client = {
  id: string;
  name: string | null;
  owner_user_id?: string | null;
  player_user_id?: string | null;
};

type PlanMeta = {
  id: string;
  created_at: string;
  version_index: number | null;
  data_hash: string | null;
};

function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

async function readJsonOrText(res: Response): Promise<any> {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json().catch(() => ({}));
  const text = await res.text().catch(() => "");
  return { error: text || `Non-JSON response (status ${res.status})` };
}

function summarizeJson(obj: any): string {
  if (!obj || typeof obj !== "object") return "JSON";
  const schema = obj?.schema_version ? String(obj.schema_version) : null;
  const themes = Array.isArray(obj?.themes) ? obj.themes.length : null;
  const weeks = Array.isArray(obj?.weeks) ? obj.weeks.length : null;

  const bits: string[] = [];
  if (schema) bits.push(schema);
  if (themes !== null) bits.push(`themes:${themes}`);
  if (weeks !== null) bits.push(`weeks:${weeks}`);
  return bits.length ? bits.join(" · ") : "JSON";
}

export default function AdminPlan3mViewerPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string>("");
  const selectedClient = useMemo(() => clients.find((c) => c.id === clientId) || null, [clients, clientId]);

  const [tab, setTab] = useState<"active" | "drafts" | "history">("active");

  const [active, setActive] = useState<any | null>(null);
  const [drafts, setDrafts] = useState<PlanMeta[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");
  const [selectedPlan, setSelectedPlan] = useState<any | null>(null);

  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Load clients for selector
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);

      const res = await fetch(apiUrl("/api/admin/clients/list"));
      const data = await readJsonOrText(res);

      if (!alive) return;

      if (!res.ok || !data?.ok) {
        setError(data?.error || "Failed to load clients");
        setLoading(false);
        return;
      }

      const rows = (data.clients || []) as Client[];
      setClients(rows);

      // Preserve selection if possible
      if (!clientId && rows.length) setClientId(rows[0].id);

      setLoading(false);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load active + drafts whenever client changes (or after activation)
  async function refreshForClient(cid: string) {
    setError(null);
    setActive(null);
    setDrafts([]);
    setSelectedVersionId("");
    setSelectedPlan(null);

    if (!cid) return;

    const [aRes, dRes] = await Promise.all([
      fetch(`/api/admin/coaching/plan3m/active?client_id=${encodeURIComponent(cid)}`),
      fetch(`/api/admin/coaching/plan3m/drafts?client_id=${encodeURIComponent(cid)}&limit=50`),
    ]);

    const a = await readJsonOrText(aRes);
    const d = await readJsonOrText(dRes);

    if (!aRes.ok || !a?.ok) {
      setError(a?.error || "Failed to load active plan");
      return;
    }
    if (!dRes.ok || !d?.ok) {
      setError(d?.error || "Failed to load drafts");
      return;
    }

    setActive(a);
    setDrafts((d.drafts || []) as PlanMeta[]);

    // Default selection:
    // - Active tab selects active plan if present
    // - Drafts/history selects newest draft
    const activeId = a.active_plan3m_id as string | null;
    if (activeId) {
      setSelectedVersionId(activeId);
      // Also load the full plan for viewer
      await loadVersion(cid, activeId);
    } else if ((d.drafts || []).length) {
      const first = (d.drafts || [])[0] as PlanMeta;
      setSelectedVersionId(first.id);
      await loadVersion(cid, first.id);
    }
  }

  useEffect(() => {
    if (!clientId) return;
    refreshForClient(clientId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function loadVersion(cid: string, vid: string) {
    if (!cid || !vid) return;

    const res = await fetch(
      `/api/admin/coaching/plan3m/version?client_id=${encodeURIComponent(cid)}&version_id=${encodeURIComponent(vid)}`
    );
    const data = await readJsonOrText(res);

    if (!res.ok || !data?.ok) {
      setError(data?.error || "Failed to load version");
      setSelectedPlan(null);
      return;
    }
    setSelectedPlan(data.plan || null);
  }

  async function activateSelected() {
    if (!clientId || !selectedVersionId) return;

    setRunning(true);
    setToast(null);
    setError(null);

    const res = await fetch(apiUrl("/api/admin/coaching/plan3m/activate"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_id: clientId, version_id: selectedVersionId }),
    });

    const data = await readJsonOrText(res);

    setRunning(false);

    if (!res.ok || !data?.ok) {
      setError(data?.error || "Activation failed");
      return;
    }

    setToast(`Activated ${shortId(selectedVersionId)} for ${shortId(clientId)}`);
    await refreshForClient(clientId);
  }

  const activeId = active?.active_plan3m_id as string | null;

  const listForTab = useMemo(() => {
    // history == drafts list but we display active marker too
    return drafts;
  }, [drafts]);

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Admin · Plan Viewer · 3-Month</h1>
          <p className="text-sm text-zinc-400 mt-1">
            View and activate immutable plan versions. Activation updates client_active_plans.active_plan3m_id.
          </p>
        </div>
        <div className="text-xs text-zinc-500">
          Guardrails: server-side generation only · explicit activation · no schema edits
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-zinc-400 mb-2">Client</div>
            <select
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              disabled={loading || running}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {(c.name ? c.name : "Player") + " · " + shortId(c.id)}
                </option>
              ))}
            </select>
            {selectedClient && (
              <div className="mt-2 text-xs text-zinc-500">
                Selected client: {selectedClient.name || "Player"} · {selectedClient.id}
              </div>
            )}
          </div>

          <div>
            <div className="text-xs text-zinc-400 mb-2">View</div>
            <div className="flex gap-2">
              <button
                className={`rounded-xl border px-3 py-2 text-sm ${
                  tab === "active" ? "border-white/20 bg-white/10 text-white" : "border-zinc-800 bg-zinc-950 text-zinc-300"
                }`}
                onClick={() => setTab("active")}
                disabled={running}
              >
                Active
              </button>
              <button
                className={`rounded-xl border px-3 py-2 text-sm ${
                  tab === "drafts" ? "border-white/20 bg-white/10 text-white" : "border-zinc-800 bg-zinc-950 text-zinc-300"
                }`}
                onClick={() => setTab("drafts")}
                disabled={running}
              >
                Drafts
              </button>
              <button
                className={`rounded-xl border px-3 py-2 text-sm ${
                  tab === "history" ? "border-white/20 bg-white/10 text-white" : "border-zinc-800 bg-zinc-950 text-zinc-300"
                }`}
                onClick={() => setTab("history")}
                disabled={running}
              >
                History
              </button>
            </div>

            <div className="mt-3 text-xs text-zinc-500">
              Active pointer: {activeId ? shortId(activeId) : "(none)"}
            </div>
          </div>
        </div>

        {(error || toast) && (
          <div className="mt-4">
            {error && <div className="rounded-xl border border-red-900/40 bg-red-950/40 p-3 text-sm text-red-200">{error}</div>}
            {!error && toast && (
              <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/40 p-3 text-sm text-emerald-200">
                {toast}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-white">Versions</div>
              <div className="text-xs text-zinc-500 mt-1">
                {tab === "active"
                  ? "Active plan (and selectable drafts below)"
                  : tab === "drafts"
                  ? "Recent drafts (newest first)"
                  : "History (drafts list with active marker)"}
              </div>
            </div>

            <button
              className="rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 px-3 py-2 text-sm disabled:opacity-40"
              disabled={!clientId || !selectedVersionId || running || selectedVersionId === activeId}
              onClick={() => {
                if (selectedVersionId === activeId) return;
                const ok = window.confirm(`Activate this plan version?\n\n${selectedVersionId}`);
                if (ok) activateSelected();
              }}
            >
              {running ? "Working…" : selectedVersionId === activeId ? "Active" : "Activate Selected"}
            </button>
          </div>

          <div className="mt-4 rounded-xl border border-zinc-800 overflow-hidden">
            <div className="max-h-[420px] overflow-auto">
              {listForTab.length === 0 && (
                <div className="p-4 text-sm text-zinc-400">No plan versions found yet for this client.</div>
              )}

              {listForTab.map((v) => {
                const isActive = activeId && v.id === activeId;
                const isSelected = v.id === selectedVersionId;

                return (
                  <button
                    key={v.id}
                    className={`w-full text-left px-4 py-3 border-b border-zinc-900 hover:bg-white/5 ${
                      isSelected ? "bg-white/10" : "bg-transparent"
                    }`}
                    onClick={async () => {
                      setSelectedVersionId(v.id);
                      await loadVersion(clientId, v.id);
                    }}
                    disabled={running}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-white">
                        {shortId(v.id)} {isActive ? <span className="ml-2 text-xs text-emerald-300">ACTIVE</span> : null}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {new Date(v.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      idx: {v.version_index ?? "—"} · hash: {v.data_hash ? v.data_hash.slice(0, 10) + "…" : "—"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3 text-xs text-zinc-500">
            Selected: {selectedVersionId ? shortId(selectedVersionId) : "(none)"}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-white">Plan JSON</div>
              <div className="text-xs text-zinc-500 mt-1">Read-only viewer (accordion).</div>
            </div>
            <div className="text-xs text-zinc-500">
              {selectedPlan?.content_json ? summarizeJson(selectedPlan.content_json) : "—"}
            </div>
          </div>

          {!selectedPlan?.content_json && (
            <div className="mt-4 text-sm text-zinc-400">Select a version to view its JSON.</div>
          )}

          {selectedPlan?.content_json && (
            <div className="mt-4">
              <details className="rounded-xl border border-zinc-800 bg-zinc-950/60" open>
                <summary className="cursor-pointer select-none px-4 py-3 text-xs text-zinc-200">
                  {summarizeJson(selectedPlan.content_json)}
                  <span className="ml-2 text-zinc-500">(click to collapse)</span>
                </summary>
                <div className="border-t border-zinc-800 p-4">
                  <pre className="text-xs overflow-auto">{JSON.stringify(selectedPlan.content_json, null, 2)}</pre>
                </div>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
