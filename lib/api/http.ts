// lib/api/http.ts
// UI-only HTTP client (no backend code). All requests go to the external API origin.

export type ApiError = {
  status: number;
  message: string;
};

function apiOrigin(): string {
  // Preferred: explicit API origin (e.g. https://api.stryklabs.com)
  // Fallback: same-origin.
  const o = process.env.NEXT_PUBLIC_API_ORIGIN;
  return o && o.trim().length ? o.trim().replace(/\/$/, "") : "";
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {}
): Promise<T> {
  const origin = apiOrigin();
  const url = `${origin}${path.startsWith("/") ? path : `/${path}`}`;

  const headers = new Headers(init.headers);
  if (init.json !== undefined) headers.set("Content-Type", "application/json");

  const res = await fetch(url, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    credentials: "include",
    cache: init.cache ?? "no-store",
  });

  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      msg = String((j as any)?.error || (j as any)?.message || msg);
    } catch {
      // ignore
    }
    const err: ApiError = { status: res.status, message: msg };
    throw err;
  }

  // 204 / empty
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}
