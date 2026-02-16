import { headers } from "next/headers";

export const dynamic = "force-dynamic";

type TelemetryItem = {
  created_at: string;
  request_id: string;
  route: string;
  session_id: string | null;
  client_id: string | null;
  cache_status: "hit" | "miss" | "bypass" | string;
  status: "ok" | "error" | string;
  model: string | null;
  duration_ms: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  cost_usd: number | null;
  error_code: string | null;
  error_message: string | null;
};

type TelemetryResponse = {
  meta: {
    limit: number;
    returned: number;
    error_rate: number;
    cache_hit_rate: number;
    avg_duration_ms: number | null;
    total_cost_usd: number;
  };
  items: TelemetryItem[];
};

function fmtPct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function fmtUsd(n: number) {
  return `$${n.toFixed(4)}`;
}

export default async function AdminTelemetryPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const limit = typeof sp.limit === "string" ? sp.limit : "200";
  const status = typeof sp.status === "string" ? sp.status : "";
  const cache_status = typeof sp.cache_status === "string" ? sp.cache_status : "";
  const session_id = typeof sp.session_id === "string" ? sp.session_id : "";
  const client_id = typeof sp.client_id === "string" ? sp.client_id : "";

  const qs = new URLSearchParams();
  qs.set("limit", limit);
  if (status) qs.set("status", status);
  if (cache_status) qs.set("cache_status", cache_status);
  if (session_id) qs.set("session_id", session_id);
  if (client_id) qs.set("client_id", client_id);

  // Server-side fetch to your own API route
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    const base = host ? `${proto}://${host}` : "http://localhost:3000";

    const res = await fetch(
        `${base}/api/admin/telemetry/coaching?${qs.toString()}`,
        {
            cache: "no-store",
            headers: {
                "x-admin-secret": process.env.ADMIN_TELEMETRY_SECRET ?? "",
            },
        }
    );


  // If NEXT_PUBLIC_BASE_URL isn't set, fallback to relative fetch (works in most Next deployments)
  const data: TelemetryResponse = res.ok
    ? await res.json()
    : ({
        meta: {
          limit: Number(limit),
          returned: 0,
          error_rate: 0,
          cache_hit_rate: 0,
          avg_duration_ms: null,
          total_cost_usd: 0,
        },
        items: [],
      } as TelemetryResponse);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Coaching Telemetry</h1>
      <p style={{ marginTop: 0, marginBottom: 16, opacity: 0.8 }}>
        Admin-only observability for coaching generation: cache, latency, tokens, cost, errors.
      </p>

      {/* Summary */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Stat label="Returned" value={`${data.meta.returned}`} />
        <Stat label="Error rate" value={fmtPct(data.meta.error_rate)} />
        <Stat label="Cache hit rate" value={fmtPct(data.meta.cache_hit_rate)} />
        <Stat label="Avg duration" value={data.meta.avg_duration_ms ? `${data.meta.avg_duration_ms} ms` : "—"} />
        <Stat label="Total cost (window)" value={fmtUsd(data.meta.total_cost_usd)} />
      </div>

      {/* Filters (simple, querystring-based) */}
      <form style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <Field label="limit" name="limit" defaultValue={limit} placeholder="200" />
        <Field label="status" name="status" defaultValue={status} placeholder="ok | error" />
        <Field label="cache_status" name="cache_status" defaultValue={cache_status} placeholder="hit | miss | bypass" />
        <Field label="session_id" name="session_id" defaultValue={session_id} placeholder="uuid" wide />
        <Field label="client_id" name="client_id" defaultValue={client_id} placeholder="uuid" wide />
        <button
          type="submit"
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #ccc",
            background: "#fff",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Apply
        </button>
      </form>

      {/* Table */}
      <div style={{ overflowX: "auto", border: "1px solid #e5e5e5", borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead style={{ background: "#fafafa" }}>
            <tr>
              <Th>Time</Th>
              <Th>Status</Th>
              <Th>Cache</Th>
              <Th>Route</Th>
              <Th>Duration</Th>
              <Th>Tokens</Th>
              <Th>Cost</Th>
              <Th>Model</Th>
              <Th>Session</Th>
              <Th>Error</Th>
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ padding: 16, opacity: 0.7 }}>
                  No telemetry rows found for this filter window.
                </td>
              </tr>
            ) : (
              data.items.map((r) => (
                <tr key={r.request_id} style={{ borderTop: "1px solid #eee" }}>
                  <Td>{new Date(r.created_at).toLocaleString()}</Td>
                  <Td>
                    <Badge tone={r.status === "error" ? "bad" : "good"}>{r.status}</Badge>
                  </Td>
                  <Td>
                    <Badge tone={r.cache_status === "hit" ? "good" : r.cache_status === "miss" ? "warn" : "neutral"}>
                      {r.cache_status}
                    </Badge>
                  </Td>
                  <Td>{r.route}</Td>
                  <Td>{r.duration_ms ? `${r.duration_ms} ms` : "—"}</Td>
                  <Td>{r.total_tokens ?? "—"}</Td>
                  <Td>{typeof r.cost_usd === "number" ? fmtUsd(r.cost_usd) : "—"}</Td>
                  <Td style={{ maxWidth: 200, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.model ?? "—"}
                  </Td>
                  <Td style={{ maxWidth: 240, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.session_id ?? "—"}
                  </Td>
                  <Td style={{ maxWidth: 260, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.status === "error" ? `${r.error_code ?? "error"}: ${r.error_message ?? ""}` : "—"}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 12, opacity: 0.7, fontSize: 12 }}>
        Tip: filter by session_id to debug a single generation chain quickly.
      </p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid #e5e5e5", borderRadius: 10, padding: 12, background: "#fff" }}>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  wide,
}: {
  label: string;
  name: string;
  defaultValue: string;
  placeholder?: string;
  wide?: boolean;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: wide ? 280 : 140 }}>
      <span style={{ fontSize: 12, opacity: 0.75 }}>{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        style={{
          padding: "10px 10px",
          borderRadius: 8,
          border: "1px solid #ccc",
          background: "#fff",
        }}
      />
    </label>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 700, borderBottom: "1px solid #eee" }}>
      {children}
    </th>
  );
}

function Td({
    children,
    style,
    ...rest
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
    return (
        <td
            {...rest}
            style={{ padding: "10px 12px", verticalAlign: "top", ...(style ?? {}) }}
        >
            {children}
        </td>
    );
}


function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "good" | "bad" | "warn" | "neutral";
}) {
  const bg =
    tone === "good" ? "#e9f7ef" : tone === "bad" ? "#fdecec" : tone === "warn" ? "#fff6e5" : "#f2f2f2";
  const border =
    tone === "good" ? "#bfe7cf" : tone === "bad" ? "#f5bcbc" : tone === "warn" ? "#f2d39c" : "#d9d9d9";
  return (
    <span style={{ display: "inline-block", padding: "3px 8px", borderRadius: 999, background: bg, border: `1px solid ${border}`, fontWeight: 700, fontSize: 12 }}>
      {children}
    </span>
  );
}
