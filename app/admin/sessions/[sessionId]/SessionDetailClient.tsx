'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSupabase } from '@/lib/supabase/useSupabase';

type CoachingOutput = {
  title?: string;
  summary?: string;
  content_md?: string;
  objectives?: { title: string; why?: string; metric_refs?: string[] }[];
  drills?: { name: string; steps: string[]; reps?: string; frequency?: string; success_metric?: string }[];
  next_session_targets?: { target: string; measure?: string }[];
};

type ShotsApiResponse = {
  summary?: {
    shotCount?: number;
    avgCarry?: number;
    avgOffline?: number;
    avgBallSpeed?: number;
    avgClubSpeed?: number;
  };
  shots?: any[];
};

type ExplainResponse =
  | {
      session_id: string;
      from_version: number | null;
      to_version: number;
      reason?: string;
      trigger?: string;
      diff?: any;
      meta?: any;
    }
  | { error: string };

type CoachingStatus = 'idle' | 'building' | 'ready' | 'unavailable';

const th: React.CSSProperties = {
  textAlign: 'left',
  borderBottom: '1px solid #ddd',
  padding: 8,
  fontWeight: 600,
};

const td: React.CSSProperties = {
  borderBottom: '1px solid #eee',
  padding: 8,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function SessionDetailClient({
  sessionId,
  isAdmin = false, // kept for future admin-only regen UX (handled elsewhere)
}: {
  sessionId: string;
  isAdmin?: boolean;
}) {
  const supabase = useSupabase();

  const [msg, setMsg] = useState('');
  const [shotsData, setShotsData] = useState<ShotsApiResponse | null>(null);

  const [coaching, setCoaching] = useState<CoachingOutput | null>(null);
  const [coachingMd, setCoachingMd] = useState<string | null>(null);
  const [coachingMeta, setCoachingMeta] = useState<{ created_at?: string; data_hash?: string } | null>(null);
  const [coachingStatus, setCoachingStatus] = useState<CoachingStatus>('idle');
  const [coachingSlow, setCoachingSlow] = useState(false);

  // Explainability UI state
  const [explainOpen, setExplainOpen] = useState(false);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainData, setExplainData] = useState<ExplainResponse | null>(null);
  const [explainErr, setExplainErr] = useState<string>('');

  const shotCount = shotsData?.shots?.length ?? 0;

  const firstShots = useMemo(() => shotsData?.shots?.slice(0, 10) ?? [], [shotsData]);
  const chartShots = useMemo(() => shotsData?.shots?.slice(0, 33) ?? [], [shotsData]);

  const fetchExplain = async () => {
    try {
      setExplainLoading(true);
      setExplainErr('');

      const res = await fetch(`/api/sessions/${sessionId}/coaching/explain`, {
        credentials: 'include',
        cache: 'no-store',
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : null;

      if (!res.ok) {
        setExplainData(null);
        setExplainErr(json?.error ?? text ?? 'Explain failed');
        return;
      }

      setExplainData(json as ExplainResponse);
    } catch (e) {
      setExplainData(null);
      setExplainErr((e as Error).message ?? String(e));
    } finally {
      setExplainLoading(false);
    }
  };

  useEffect(() => {
    if (!supabase) return; // ✅ FIX: was `ret`

    let cancelled = false;

    (async () => {
      try {
        setMsg('Loading…');
        setCoachingSlow(false);
        setExplainOpen(false);
        setExplainErr('');
        setExplainData(null);

        if (!sessionId) {
          setMsg('Missing sessionId');
          return;
        }

        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;

        if (!token) {
          setMsg('Not authenticated');
          return;
        }

        // 1) Shots + summary (API)
        const res = await fetch(`/api/upload/sessions/${sessionId}/shots`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });

        const text = await res.text();
        let json: any = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }

        if (!res.ok) {
          setMsg(`Error: ${json?.error ?? text ?? 'Unknown error'}`);
          return;
        }

        if (cancelled) return;
        setShotsData(json as ShotsApiResponse);

        // 2) Coaching is read-only (persisted). Fetch via server endpoint (coaching_versions truth).
        setCoachingStatus('building');
        setCoaching(null);
        setCoachingMd(null);
        setCoachingMeta(null);

        // Coaching requires session_stats; surface if missing
        const { data: statsRow, error: statsErr } = await supabase
          .from('session_stats')
          .select('session_id')
          .eq('session_id', sessionId)
          .limit(1)
          .maybeSingle();

        if (cancelled) return;

        if (statsErr || !statsRow) {
          setCoachingStatus('unavailable');
          setMsg('Loaded ✅');
          setCoachingSlow(false);
          return;
        }

        type CoachingApiRow = {
          status: 'ready';
          created_at?: string | null;
          data_hash?: string | null;
          output_json?: any;
          content_md?: string | null;
          client_id?: string;
          session_id?: string;
        };

        type CoachingApiErr = {
          status?: string;
          error?: string;
        };

        type CoachingApiResponse = CoachingApiRow | CoachingApiErr;

        let foundRow: CoachingApiResponse | null = null;

        // Poll the SERVER endpoint (not direct DB table reads client-side)
        for (let attempt = 0; attempt < 12; attempt++) {
          const cleanSessionId = String(sessionId).replace(/[^a-f0-9-]/gi, "");

          const r = await fetch(`/api/sessions/${cleanSessionId}/coaching`, {
            credentials: "include",
            cache: "no-store",
          });

          if (cancelled) return;

          if (r.ok) {
            foundRow = (await r.json()) as CoachingApiResponse;
            break;
          }

          // 404 means coaching not available yet; keep polling a bit
          if (r.status !== 404) {
            foundRow = { status: 'error', error: await r.text() };
            break;
          }

          await sleep(2500);
        }

        if (cancelled) return;

        const isReadyCoaching = (
          row: CoachingApiResponse | null
        ): row is CoachingApiRow => {
          return !!row && (row as any).status === 'ready' && 'output_json' in (row as any);
        };

        if (isReadyCoaching(foundRow)) {
          const out = (foundRow.output_json ?? null) as CoachingOutput | null;

          setCoaching(out);
          setCoachingMd(foundRow.content_md ?? out?.content_md ?? null);
          setCoachingMeta({
            created_at: foundRow.created_at ?? undefined,
            data_hash: foundRow.data_hash ?? undefined,
          });
          setCoachingStatus('ready');
          setCoachingSlow(false);
        } else {
          setCoaching(null);
          setCoachingMd(null);
          setCoachingMeta(null);
          setCoachingStatus('unavailable');
          setCoachingSlow(true);
        }

        setMsg('Loaded ✅');
      } catch (e) {
        setMsg(`Error: ${(e as Error).message ?? String(e)}`);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, supabase]);

  if (!supabase) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Session Detail</h1>
        <div style={{ marginBottom: 16, opacity: 0.7 }}>Session: {sessionId}</div>
        <div>Loading…</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Session Detail</h1>
      <div style={{ marginBottom: 8, opacity: 0.7 }}>Session: {sessionId}</div>
      <div style={{ marginBottom: 16 }}>{msg}</div>

      {/* Summary */}
      {shotsData?.summary && (
        <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 16 }}>
          <div>
            <b>Shots:</b> {shotsData.summary.shotCount ?? shotCount}
          </div>
          <div>
            <b>Avg Carry:</b> {shotsData.summary.avgCarry?.toFixed?.(1) ?? '—'}
          </div>
          <div>
            <b>Avg Offline:</b> {shotsData.summary.avgOffline?.toFixed?.(1) ?? '—'}
          </div>
          <div>
            <b>Avg Ball Speed:</b> {shotsData.summary.avgBallSpeed?.toFixed?.(1) ?? '—'}
          </div>
          <div>
            <b>Avg Club Speed:</b> {shotsData.summary.avgClubSpeed?.toFixed?.(1) ?? '—'}
          </div>
        </div>
      )}

      {/* Coaching (read-only, deterministic) */}
      <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Coaching</h2>

            <button
              type="button"
              onClick={async () => {
                const next = !explainOpen;
                setExplainOpen(next);
                if (next && !explainData && !explainLoading) await fetchExplain();
              }}
              disabled={(!coaching && !coachingMd) || explainLoading}
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                border: '1px solid #ddd',
                background: '#fff',
                cursor: (!coaching && !coachingMd) || explainLoading ? 'not-allowed' : 'pointer',
                opacity: !coaching && !coachingMd ? 0.5 : 1,
                fontSize: 12,
              }}
              title={!coaching && !coachingMd ? 'No coaching available' : 'Explain why this advice changed'}
            >
              {explainLoading ? 'Loading…' : explainOpen ? 'Hide why' : 'Why this advice?'}
            </button>
          </div>

          <div style={{ opacity: 0.7, fontSize: 12 }}>
            {coachingMeta?.created_at ? `Created: ${new Date(coachingMeta.created_at).toLocaleString()}` : ''}
            {coachingMeta?.data_hash ? ` · hash: ${coachingMeta.data_hash}` : ''}
          </div>
        </div>

        {explainOpen ? (
          <div style={{ marginTop: 10, borderTop: '1px solid #eee', paddingTop: 10 }}>
            {explainErr ? (
              <div style={{ color: '#b00020', fontSize: 13 }}>{explainErr}</div>
            ) : explainData ? (
              <pre
                style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: 12,
                  lineHeight: 1.45,
                  background: '#fafafa',
                  border: '1px solid #eee',
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                {JSON.stringify(explainData, null, 2)}
              </pre>
            ) : (
              <div style={{ fontSize: 13, opacity: 0.8 }}>No explain data.</div>
            )}
          </div>
        ) : null}

        {/* Explicit failure surfacing */}
        {!coaching && !coachingMd ? (
          <div style={{ opacity: 0.85, marginTop: 10 }}>
            {coachingStatus === 'unavailable' ? (
              <div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Coaching not available</div>
                <div style={{ fontSize: 13 }}>
                  If this session has shots but no <code>session_stats</code>, coaching cannot be generated yet.
                </div>
                {coachingSlow ? (
                  <div style={{ fontSize: 13, marginTop: 6 }}>
                    If you just triggered a regen, it may still be processing. Refresh in ~30–60s.
                  </div>
                ) : null}
              </div>
            ) : (
              <div>Generating coaching… (usually a few seconds)</div>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 10 }}>
            {/* Prefer markdown if present */}
            {coachingMd ? (
              <pre
                style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: 13,
                  lineHeight: 1.45,
                  background: '#fafafa',
                  border: '1px solid #eee',
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                {coachingMd}
              </pre>
            ) : null}

            {/* Structured JSON render (fallback only when markdown missing) */}
            {!coachingMd && coaching ? (
              <div>
                {coaching.title && <div style={{ fontWeight: 700, marginBottom: 6 }}>{coaching.title}</div>}
                {coaching.summary && <div style={{ marginBottom: 12 }}>{coaching.summary}</div>}

                {coaching.objectives?.length ? (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Objectives</div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {coaching.objectives.map((o, i) => (
                        <li key={i} style={{ marginBottom: 6 }}>
                          <b>{o.title}</b>
                          {o.why ? <span style={{ opacity: 0.85 }}> — {o.why}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {coaching.drills?.length ? (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Drills</div>
                    {coaching.drills.map((d, i) => (
                      <div
                        key={i}
                        style={{ padding: 10, border: '1px solid #eee', borderRadius: 8, marginBottom: 10 }}
                      >
                        <div style={{ fontWeight: 700 }}>{d.name}</div>
                        {d.reps || d.frequency ? (
                          <div style={{ opacity: 0.8, fontSize: 12, marginTop: 4 }}>
                            {d.reps ? <span>Reps: {d.reps}</span> : null}
                            {d.reps && d.frequency ? <span> · </span> : null}
                            {d.frequency ? <span>Frequency: {d.frequency}</span> : null}
                          </div>
                        ) : null}
                        <ol style={{ marginTop: 8, marginBottom: 0, paddingLeft: 18 }}>
                          {d.steps?.map((s, idx) => (
                            <li key={idx} style={{ marginBottom: 4 }}>
                              {s}
                            </li>
                          ))}
                        </ol>
                        {d.success_metric ? (
                          <div style={{ marginTop: 8, opacity: 0.85 }}>
                            <b>Success metric:</b> {d.success_metric}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {coaching.next_session_targets?.length ? (
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Next session targets</div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {coaching.next_session_targets.map((t, i) => (
                        <li key={i} style={{ marginBottom: 6 }}>
                          <b>{t.target}</b>
                          {t.measure ? <span style={{ opacity: 0.85 }}> — {t.measure}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Shots table */}
      {shotCount > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ marginBottom: 8 }}>First 10 Shots</h3>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>#</th>
                <th style={th}>Carry (yd)</th>
                <th style={th}>Offline (yd)</th>
                <th style={th}>Ball Speed (mph)</th>
                <th style={th}>Club Speed (mph)</th>
              </tr>
            </thead>
            <tbody>
              {firstShots.map((s: any, i: number) => (
                <tr key={i}>
                  <td style={td}>{i + 1}</td>
                  <td style={td}>{s.data?.carry_yd ?? '—'}</td>
                  <td style={td}>{s.data?.offline_yd ?? '—'}</td>
                  <td style={td}>{s.data?.ball_speed_mph ?? '—'}</td>
                  <td style={td}>{s.data?.club_speed_mph ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Quick charts */}
      {shotCount > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ marginBottom: 8 }}>Quick Charts</h3>

          {/* Carry */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 6 }}>
              <b>Carry (yd)</b>
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 90 }}>
              {chartShots.map((s: any, i: number) => {
                const v = Number(s.data?.carry_yd);
                const h = Number.isFinite(v) ? Math.max(2, Math.min(90, v)) : 2;
                return (
                  <div
                    key={`c-${i}`}
                    style={{
                      width: 6,
                      height: h,
                      background: '#444',
                      borderRadius: 2,
                      opacity: 0.8,
                    }}
                    title={Number.isFinite(v) ? String(v) : '—'}
                  />
                );
              })}
            </div>
          </div>

          {/* Offline */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 6 }}>
              <b>Offline (yd)</b>
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 90 }}>
              {chartShots.map((s: any, i: number) => {
                const v = Number(s.data?.offline_yd);
                const h = Number.isFinite(v) ? Math.max(2, Math.min(90, Math.abs(v))) : 2;
                return (
                  <div
                    key={`o-${i}`}
                    style={{
                      width: 6,
                      height: h,
                      background: '#888',
                      borderRadius: 2,
                      opacity: 0.8,
                    }}
                    title={Number.isFinite(v) ? String(v) : '—'}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
