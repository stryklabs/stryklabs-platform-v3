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

type Session = {
  id: string;
  session_date: string | null;
  created_at: string | null;
  import_id: string | null;
  source: string | null;
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

export default function AdminCoachingOpsPage() {
  function summarizeResult(r: any): string {
    if (!r || typeof r !== "object") return "Result";
    const ok = r.ok === true ? "ok:true" : r.ok === false ? "ok:false" : "ok:?";
    const bits: string[] = [ok];

    const pick = (k: string) =>
      typeof (r as any)?.[k] === "string" && String((r as any)[k]).length > 0
        ? String((r as any)[k])
        : null;

    const planVer = pick("plan_version_id");
    const sessVer = pick("session_coaching_version_id");
    const activated = pick("activated_version_id");

    if (planVer) bits.push(`plan_version:${shortId(planVer)}`);
    if (sessVer) bits.push(`session_version:${shortId(sessVer)}`);
    if (activated) bits.push(`activated:${shortId(activated)}`);

    const msg = pick("message") || pick("status");
    if (msg) bits.push(msg);

    return bits.join(" · ");
  }

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string>("");

  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState<string>("");

  const [manualSessionId, setManualSessionId] = useState<string>("");

  const [confirm, setConfirm] = useState<null | {
    kind: "plan3m" | "sessioncoach" | "sessioncoach_bulk";
  }>(null);

  const [result, setResult] = useState<any>(null);
  const [lastPlan3mVersionId, setLastPlan3mVersionId] = useState<string>("");
  const [running, setRunning] = useState(false);

  // Load clients (admin-only route enforces authz)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(apiUrl("/api/admin/clients/list"), { cache: "no-store", credentials: "include" });
        const j = await readJsonOrText(res);
        if (!alive) return;

        if (!res.ok) {
          setError(j?.error ?? `Failed to load clients (status ${res.status})`);
          setLoading(false);
          return;
        }

        const list = Array.isArray(j?.clients) ? (j.clients as Client[]) : [];
        setClients(list);
        if (list.length > 0) setClientId(String(list[0].id));
        setLoading(false);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? String(e));
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Load sessions for selected client
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!clientId) return;
      try {
        setError(null);
        setSessions([]);
        setSessionId("");

        const res = await fetch(apiUrl(`/api/admin/sessions/list?client_id=${encodeURIComponent(clientId)}`), {
          cache: "no-store",
          credentials: "include",
        });
        const j = await readJsonOrText(res);
        if (!alive) return;

        if (!res.ok) {
          setError(j?.error ?? `Failed to load sessions (status ${res.status})`);
          return;
        }

        const list = Array.isArray(j?.sessions) ? (j.sessions as Session[]) : [];
        setSessions(list);
        if (list.length > 0) setSessionId(String(list[0].id));
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [clientId]);

  const selectedClient = useMemo(
    () => clients.find((c) => String(c.id) === String(clientId)) ?? null,
    [clients, clientId]
  );

  const selectedSession = useMemo(
    () => sessions.find((s) => String(s.id) === String(sessionId)) ?? null,
    [sessions, sessionId]
  );

  const effectiveSessionId = useMemo(() => {
    const m = manualSessionId.trim();
    return m.length > 0 ? m : sessionId;
  }, [manualSessionId, sessionId]);

  async function runAction(kind: "plan3m" | "sessioncoach" | "sessioncoach_bulk") {
    setError(null);
    setResult(null);
    setRunning(true);
    try {
      const cid = (clientId || "").trim();
      if (!cid) throw new Error("client_id is required");
      if (kind === "plan3m") {
        const res = await fetch(apiUrl("/api/admin/coaching/ops/plan3m"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ client_id: cid, reason: "admin_ui" }),
        });
        const j = await readJsonOrText(res);
        if (!res.ok) throw new Error(j?.error ?? `Plan regen failed (status ${res.status})`);
        setResult(j);
        if (typeof (j as any)?.plan_version_id === "string") {
          setLastPlan3mVersionId(String((j as any).plan_version_id));
        }
        return;
      }

      if (kind === "sessioncoach_bulk") {
        const res = await fetch(apiUrl("/api/admin/coaching/ops/sessioncoach"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ client_id: cid, all_sessions: true, limit: 50 }),
        });
        const j = await readJsonOrText(res);
        if (!res.ok) throw new Error(j?.error ?? `Bulk session regen failed (status ${res.status})`);
        setResult(j);
        if (typeof (j as any)?.plan_version_id === "string") {
          setLastPlan3mVersionId(String((j as any).plan_version_id));
        }
        return;
      }

      // single sessioncoach
      const sid = effectiveSessionId.trim();
      if (!sid) throw new Error("session_id is required");

      const res = await fetch(apiUrl("/api/admin/coaching/ops/sessioncoach"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ client_id: cid, session_id: sid }),
      });
      const j = await readJsonOrText(res);
      if (!res.ok) throw new Error(j?.error ?? `Session regen failed (status ${res.status})`);
      setResult(j);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setRunning(false);
    }
  }

  
  async function activatePlan3m(versionId: string) {
    setError(null);
    setRunning(true);
    try {
      const cid = (clientId || "").trim();
      if (!cid) throw new Error("client_id is required");
      const vid = (versionId || "").trim();
      if (!vid) throw new Error("plan version id is required");

      const res = await fetch(apiUrl("/api/admin/coaching/plan3m/activate"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ client_id: cid, version_id: vid }),
      });
      const j = await readJsonOrText(res);
      if (!res.ok || !j?.ok) throw new Error(j?.error ?? `Activation failed (status ${res.status})`);
      setResult(j);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setRunning(false);
    }
  }

if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-zinc-400">Loading…</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-xl font-semibold">Admin · Coaching Ops</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Admin-only regen controls. Creates new immutable rows in <span className="font-mono">coaching_versions</span>.
          </p>
        </div>
        <div className="text-xs text-zinc-400 text-right">
          <div>Guardrails: server-side generation only · explicit confirmation · no schema edits</div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-zinc-400">Client</label>
            <select
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name ?? "Unnamed"} · {shortId(c.id)}
                </option>
              ))}
              {clients.length === 0 && <option value="">(none)</option>}
            </select>
          </div>

          <div>
            <label className="text-xs text-zinc-400">Session (from list)</label>
            <select
              className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.session_date ?? s.created_at ?? "Unknown date"} · {shortId(s.id)}
                </option>
              ))}
              {sessions.length === 0 && <option value="">(none)</option>}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <label className="text-xs text-zinc-400">Or paste Session ID (overrides selection)</label>
          <input
            className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm font-mono"
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            value={manualSessionId}
            onChange={(e) => setManualSessionId(e.target.value)}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
            <button
                className="rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 px-4 py-2 text-sm disabled:opacity-40"
                disabled={!clientId || running}
                onClick={() => setConfirm({ kind: "plan3m" })}
            >
                Regen 3-Month Plan
            </button>

            <button
                className="rounded-xl bg-emerald-500/15 hover:bg-emerald-500/20 border border-emerald-500/20 px-4 py-2 text-sm disabled:opacity-40"
                disabled={!clientId || running || !lastPlan3mVersionId}
                onClick={() => activatePlan3m(lastPlan3mVersionId)}
                title={lastPlan3mVersionId ? `Activate ${shortId(lastPlan3mVersionId)}` : "Regen first to create a draft"}
            >
                Activate 3-Month Plan
            </button>

            <button
                className="rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 px-4 py-2 text-sm disabled:opacity-40"
                disabled={!clientId || !effectiveSessionId.trim() || running}
                onClick={() => result && setConfirm(result)}
            >
                Use Last Result (confirm)
            </button>

            <button
                className="rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 px-4 py-2 text-sm disabled:opacity-40"
                disabled={!clientId || running}
                onClick={() => setConfirm({ kind: "sessioncoach_bulk" })}
            >
                Regen All Sessions (cap 50)
            </button>
        </div>

        {result && (
            <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="text-xs text-zinc-400 mb-2">Result</div>

                <details className="rounded-xl border border-zinc-800 bg-zinc-950/60">
                    <summary className="cursor-pointer select-none px-4 py-3 text-xs text-zinc-200">
                        {summarizeResult(result)}
                        <span className="ml-2 text-zinc-500">(click to expand)</span>
                    </summary>
                    <div className="border-t border-zinc-800 p-4">
                        <pre className="text-xs overflow-auto">{JSON.stringify(result, null, 2)}</pre>
                    </div>
                </details>
            </div>
        )}

        {selectedClient && (
          <div className="mt-4 text-xs text-zinc-400 font-mono">
            Selected client: {selectedClient.name ?? "Unnamed"} · {selectedClient.id}
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-red-900/40 bg-red-950/30 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
          <div className="text-xs text-zinc-400 mb-2">Result</div>
          <pre className="text-xs overflow-auto">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="text-lg font-semibold">Confirm admin action</div>
            <div className="mt-2 text-sm text-zinc-300">
              You are about to run{" "}
              <span className="font-mono">
                {confirm.kind === "plan3m"
                  ? "plan3m regen"
                  : confirm.kind === "sessioncoach"
                    ? "sessioncoach regen"
                    : "sessioncoach bulk regen"}
              </span>
              . This will create new immutable rows in <span className="font-mono">coaching_versions</span>.
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-xl border border-zinc-800 bg-transparent px-4 py-2 text-sm hover:bg-white/5"
                onClick={() => setConfirm(null)}
                disabled={running}
              >
                Cancel
              </button>
              <button
                className="rounded-xl bg-red-600/80 hover:bg-red-600 px-4 py-2 text-sm disabled:opacity-40"
                onClick={async () => {
                  const k = confirm.kind;
                  setConfirm(null);
                  await runAction(k);
                }}
                disabled={running}
              >
                Yes, run
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
