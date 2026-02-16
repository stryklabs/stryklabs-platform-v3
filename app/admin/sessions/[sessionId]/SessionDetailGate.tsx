'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/lib/supabase/useSupabase';
import SessionDetailClient from './SessionDetailClient';

type WhoAmI = { userId: string | null; is_admin: boolean };

export default function SessionDetailGate({
  sessionId,
  isAdmin = false,
}: {
  sessionId: string;
  isAdmin?: boolean;
}) {

  const router = useRouter();
  const supabase = useSupabase();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;

    (async () => {
      // 1) must have a session
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        router.replace('/login');
        return;
      }

      // 2) must be admin to view /admin/*
      const res = await fetch('/api/whoami', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });

      if (!res.ok) {
        router.replace('/login');
        return;
      }

      const who = (await res.json()) as WhoAmI;

      if (!who?.userId || !who.is_admin) {
        router.replace('/dashboard');
        return;
      }

      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

    if (!supabase) {
        return null;
    }

  return <SessionDetailClient sessionId={sessionId} isAdmin={isAdmin} />;
}
