'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Experience = 'beginner' | 'improver' | 'intermediate' | 'low_hcap' | 'competitive' | '';
type Status = 'idle' | 'loading' | 'error' | 'done';

type Profile = {
  id: string;
  username: string | null;
  full_name?: string | null;
  handicap?: number | null;
  golf_experience?: Experience | null;
  has_home_sim?: boolean | null;
  launch_monitor?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  postcode?: string | null;
  country?: string | null;
};

/**
 * Onboarding (cookie-session)
 * - GET /api/auth/user -> reads signed-in user via cookies and returns { user, profile }
 * - POST /api/profile/upsert -> upserts public.profiles using id = auth.uid()
 *
 * UX:
 * - Username is primary (locked once stored in DB)
 * - Email shown as secondary text so user doesn't think they pick username here
 */
export default function OnboardingPage() {
  const router = useRouter();

  const [status, setStatus] = useState<Status>('idle');
  const [err, setErr] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState('');

  const [profile, setProfile] = useState<Profile | null>(null);
  const [usernameInput, setUsernameInput] = useState('');

  const [fullName, setFullName] = useState('');
  const [handicap, setHandicap] = useState<string>('');
  const [experience, setExperience] = useState<Experience>('');
  const [hasHomeSim, setHasHomeSim] = useState(false);
  const [launchMonitor, setLaunchMonitor] = useState('');
  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [city, setCity] = useState('');
  const [postcode, setPostcode] = useState('');
  const [country, setCountry] = useState('');

  const persistedUsername = profile?.username || '';
  const usernameLocked = Boolean(profile?.username);

  // If username is already stored, use it. Otherwise use input, falling back to pending_username from signup.
  const username = useMemo(() => {
    if (usernameLocked) return persistedUsername;
    if (usernameInput) return usernameInput;
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem('pending_username') || '';
  }, [usernameLocked, persistedUsername, usernameInput]);

  const normalizedUsername = useMemo(() => username.trim().replace(/\s+/g, '').toLowerCase(), [username]);
  const usernameValid = useMemo(() => /^[a-z0-9_]{3,20}$/.test(normalizedUsername), [normalizedUsername]);

  async function loadUserFromCookies() {
    setErr(null);

    const res = await fetch('/api/auth/user', { method: 'GET', credentials: 'include', cache: 'no-store' });
    const json = await res.json().catch(() => null);

    if (!res.ok) {
      // This includes the “User from sub claim in JWT does not exist” case.
      setUserId(null);
      setProfile(null);
      setEmail('');
      setErr(json?.error || `Auth check failed (${res.status})`);
      return;
    }

    const user = json?.user;
    if (!user?.id) {
      setUserId(null);
      setProfile(null);
      setEmail('');
      return;
    }

    setUserId(user.id);
    setEmail(user.email || '');

    const p: Profile | null = json?.profile || null;
    setProfile(p);

    if (p) {
      setUsernameInput(p.username || '');
      setFullName(p.full_name || '');
      setHandicap(p.handicap != null ? String(p.handicap) : '');
      setExperience((p.golf_experience as Experience) || '');
      setHasHomeSim(Boolean(p.has_home_sim));
      setLaunchMonitor(p.launch_monitor || '');
      setAddress1(p.address_line1 || '');
      setAddress2(p.address_line2 || '');
      setCity(p.city || '');
      setPostcode(p.postcode || '');
      setCountry(p.country || '');
    } else {
      setUsernameInput('');
    }
  }

  useEffect(() => {
    loadUserFromCookies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep pending username from signup while not locked
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (usernameLocked) return;
    if (!normalizedUsername) return;
    window.localStorage.setItem('pending_username', normalizedUsername);
  }, [usernameLocked, normalizedUsername]);

  async function save() {
    setStatus('loading');
    setErr(null);

    const payload = {
      username: usernameLocked ? persistedUsername : normalizedUsername,
      full_name: fullName.trim(),
      handicap: handicap === '' ? null : Number(handicap),
      golf_experience: experience || null,
      has_home_sim: hasHomeSim,
      launch_monitor: launchMonitor || null,
      address_line1: address1 || null,
      address_line2: address2 || null,
      city: city || null,
      postcode: postcode || null,
      country: country || null,
    };

    const res = await fetch('/api/profile/upsert', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      setStatus('error');
      setErr(json?.error || `Save failed (${res.status})`);
      return;
    }

    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('pending_username');
    }

    setStatus('done');
    router.push('/smart-bag');
  }

  const needsLogin = !userId;
  const saveDisabled = needsLogin || status === 'loading' || (!usernameLocked && !usernameValid);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white p-6">
      <div className="w-full max-w-2xl rounded-2xl border border-white/15 bg-white/5 p-6 shadow-xl">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold">Onboarding</h1>
          <p className="text-white/70">Complete your golf profile (V1).</p>
          {needsLogin && (
            <p className="mt-2 text-sm text-red-400">
              Please log in after confirming your email, then come back here to save onboarding.
            </p>
          )}
        </div>

        {err && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm">
            {err}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-white/60">Username {usernameLocked ? '(locked)' : ''}</label>
            <input
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 disabled:opacity-60"
              value={usernameLocked ? persistedUsername : usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              disabled={usernameLocked}
              placeholder={usernameLocked ? '' : 'e.g. mani_r'}
            />
            {email && (
              <p className="mt-1 text-xs text-white/50">
                Signed in as <span className="text-white/70">{email}</span>
              </p>
            )}
            {usernameLocked && persistedUsername && (
              <p className="mt-1 text-xs text-white/50">Username is set during signup and can’t be changed.</p>
            )}
            {!usernameLocked && normalizedUsername && !usernameValid && (
              <p className="mt-1 text-xs text-red-300">
                Username must be 3–20 chars: a–z, 0–9, underscore. No spaces.
              </p>
            )}
          </div>

          <div>
            <label className="text-xs text-white/60">Handicap (optional)</label>
            <input
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2"
              value={handicap}
              onChange={(e) => setHandicap(e.target.value)}
              inputMode="decimal"
            />
          </div>

          <div>
            <label className="text-xs text-white/60">Full name</label>
            <input
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-white/60">Experience</label>
            <select
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2"
              value={experience}
              onChange={(e) => setExperience(e.target.value as Experience)}
            >
              <option value="">Select…</option>
              <option value="beginner">Beginner</option>
              <option value="improver">Improver</option>
              <option value="intermediate">Intermediate</option>
              <option value="low_hcap">Low handicap</option>
              <option value="competitive">Competitive</option>
            </select>
          </div>

          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 text-sm text-white/80">
              <input type="checkbox" checked={hasHomeSim} onChange={(e) => setHasHomeSim(e.target.checked)} />
              I have a home simulator
            </label>
          </div>

          <div className="col-span-2">
            <label className="text-xs text-white/60">Launch monitor (optional)</label>
            <input
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2"
              value={launchMonitor}
              onChange={(e) => setLaunchMonitor(e.target.value)}
              placeholder="SKYTRAK / Trackman / GCQuad / etc."
            />
          </div>

          <div className="col-span-2">
            <label className="text-xs text-white/60">Address line 1 (optional)</label>
            <input
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2"
              value={address1}
              onChange={(e) => setAddress1(e.target.value)}
            />
          </div>

          <div className="col-span-2">
            <label className="text-xs text-white/60">Address line 2 (optional)</label>
            <input
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2"
              value={address2}
              onChange={(e) => setAddress2(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-white/60">City (optional)</label>
            <input
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-white/60">Postcode (optional)</label>
            <input
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2"
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
            />
          </div>

          <div className="col-span-2">
            <label className="text-xs text-white/60">Country (optional)</label>
            <input
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <Link className="text-sm text-white/70 underline" href="/login">
            Go to login
          </Link>

          <div className="flex items-center gap-3">
            <button
              className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
              onClick={loadUserFromCookies}
              type="button"
            >
              Reload
            </button>

            <button
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
              onClick={save}
              type="button"
              disabled={saveDisabled}
              title={!usernameLocked && !usernameValid ? 'Enter a valid username to continue' : undefined}
            >
              {status === 'loading' ? 'Saving…' : 'Save & continue'}
            </button>
          </div>
        </div>

        <p className="mt-3 text-xs text-white/50">
          Note: If email confirmation is enabled, confirm via email first, then log in, then save here.
        </p>
      </div>
    </div>
  );
}
