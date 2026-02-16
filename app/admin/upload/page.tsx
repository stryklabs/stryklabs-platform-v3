'use client';

import { useEffect, useMemo, useState } from 'react';

type Client = {
  id: string;
  name: string | null;
  owner_user_id: string | null;
  player_user_id: string | null;
  created_at: string | null;
};

type UploadResult =
  | { ok: true; session_id: string; import_id?: string; source?: string; rows_inserted?: number; note?: string }
  | { error: string; details?: any };

export default function AdminUploadPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<'auto' | 'skytrak' | 'gspro'>('auto');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>('');
  const [result, setResult] = useState<UploadResult | null>(null);

  const filename = useMemo(() => file?.name ?? 'No file chosen', [file]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/clients/list', { cache: 'no-store', credentials: 'include' });
        const j = await res.json().catch(() => ({}));
        if (!alive) return;
        if (res.ok && j?.ok && Array.isArray(j.clients)) {
          setClients(j.clients);
          if (!clientId && j.clients[0]?.id) setClientId(j.clients[0].id);
        } else {
          // If forbidden, the page will still render but uploads will fail.
          setMsg(j?.error ? `Clients list: ${j.error}` : 'Unable to load clients list.');
        }
      } catch (e: any) {
        if (!alive) return;
        setMsg(e?.message ?? 'Unable to load clients list.');
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit() {
    setMsg('');
    setResult(null);

    if (!file) {
      setMsg('Please choose a CSV file first.');
      return;
    }
    if (!clientId) {
      setMsg('Please select a client to upload for.');
      return;
    }

    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('client_id', clientId);
      if (source !== 'auto') fd.append('source', source);

      const res = await fetch('/api/upload/sessions', { method: 'POST', body: fd, credentials: 'include' });
      const json = (await res.json().catch(() => ({}))) as UploadResult;

      if (!res.ok) {
        setResult({ error: (json as any)?.error ?? `Upload failed (${res.status})`, details: json });
        return;
      }

      setResult(json);
      setMsg('Upload complete.');
    } catch (e: any) {
      setResult({ error: e?.message ?? 'Upload failed' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto w-full max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">Admin Upload</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Upload a CSV on behalf of a selected client. (Supports bulk uploads later.)
        </p>

        <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 shadow-sm">
          <label className="block text-sm font-medium text-neutral-200">Client</label>
          <select
            className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            disabled={busy}
          >
            {clients.length === 0 ? (
              <option value="">No clients found</option>
            ) : (
              clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name ? `${c.name}` : c.id}
                </option>
              ))
            )}
          </select>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-neutral-200">Source</label>
              <select
                className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                value={source}
                onChange={(e) => setSource(e.target.value as any)}
                disabled={busy}
              >
                <option value="auto">Auto-detect</option>
                <option value="skytrak">SkyTrak</option>
                <option value="gspro">GSPro</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-200">CSV file</label>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  disabled={busy}
                  className="block w-full text-sm file:mr-4 file:rounded-xl file:border-0 file:bg-neutral-800 file:px-4 file:py-2 file:text-sm file:font-medium file:text-neutral-100 hover:file:bg-neutral-700"
                />
              </div>
              <div className="mt-1 text-xs text-neutral-500">{filename}</div>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={onSubmit}
              disabled={busy}
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-neutral-900 disabled:opacity-50"
            >
              {busy ? 'Uploading…' : 'Upload'}
            </button>
            {msg ? <span className="text-sm text-neutral-300">{msg}</span> : null}
          </div>

          {result ? (
            <pre className="mt-4 overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-200">
              {JSON.stringify(result, null, 2)}
            </pre>
          ) : null}
        </div>
      </div>
    </main>
  );
}
