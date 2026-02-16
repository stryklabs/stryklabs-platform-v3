'use client';
export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react';
import { useSupabase } from '@/lib/supabase/useSupabase';

type ClientRow = { id: string; name: string; created_at: string; player_user_id?: string | null };

export default function AdminClientsPage() {
  const supabase = useSupabase();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function load(sb: NonNullable<typeof supabase>) {
    const { data, error } = await sb
      .from('clients')
      .select('id,name,created_at,player_user_id')
      .order('created_at', { ascending: false });

    if (error) setMsg(error.message);
    else setClients((data ?? []) as ClientRow[]);
  }

  async function doCreate() {
    setMsg('');
    setLoading(true);

    try {
      const res = await fetch('/api/admin/clients/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(json?.error ?? `Create failed (${res.status})`);
        return;
      }

      setName('');
      setEmail('');
      setMsg(`Invited + created client: ${json?.client?.name ?? ''}`);

      if (supabase) await load(supabase);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!supabase) return;
    load(supabase);
  }, [supabase]);

  const canCreate = Boolean(supabase) && name.trim().length > 0 && email.trim().length > 0 && !loading;

  return (
    <main style={{ padding: 24, maxWidth: 720 }}>
      <h1>Admin – Clients</h1>

      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        <input
          style={{ padding: 8 }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Client name"
        />

        <input
          style={{ padding: 8 }}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Player email (invite)"
        />

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => {
              if (!canCreate) return;
              void doCreate();
            }}
            disabled={!canCreate}
          >
            Invite + Create
          </button>
        </div>
      </div>

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}

      <h2 style={{ marginTop: 24 }}>Existing</h2>
      <ul>
        {clients.map((c) => (
          <li key={c.id}>
            {c.name} — {new Date(c.created_at).toLocaleString()}
            {c.player_user_id ? ` — linked` : ` — not linked`}
          </li>
        ))}
      </ul>
    </main>
  );
}
