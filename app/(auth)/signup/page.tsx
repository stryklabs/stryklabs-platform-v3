"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_ORIGIN || "").replace(/\/$/, "");
const apiUrl = (p: string) => `${API_ORIGIN}${p}`;

type Status = "idle" | "checking" | "ready" | "taken" | "signing" | "done" | "error";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, anon);
}

function validUsername(u: string) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(u);
}

export default function SignupPage() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabase(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/onboarding");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const u = username.trim();
    setMsg(null);

    if (!u) {
      setAvailable(null);
      setStatus("idle");
      return;
    }
    if (!validUsername(u)) {
      setAvailable(false);
      setStatus("taken");
      setMsg("3–20 chars. Letters, numbers, underscore.");
      return;
    }

    setStatus("checking");
    const t = setTimeout(async () => {
      try {
        const res = await fetch(apiUrl("/api/auth/username-available"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: u }),
          credentials: "include",
        });

        const json = await res.json().catch(() => null);

        if (!res.ok) {
          setAvailable(false);
          setStatus("taken");
          setMsg(json?.error || `Username check failed (${res.status})`);
          return;
        }

        const isAvail = Boolean(json?.available);
        setAvailable(isAvail);
        setStatus(isAvail ? "ready" : "taken");
        setMsg(isAvail ? null : "Username is taken");
      } catch (e: any) {
        setAvailable(false);
        setStatus("taken");
        setMsg(e?.message || "Username check failed");
      }
    }, 450);

    return () => clearTimeout(t);
  }, [username]);

  async function onSubmit() {
    setMsg(null);

    const u = username.trim();
    if (!email.trim() || !password) return setMsg("Email and password are required.");
    if (!validUsername(u)) return setMsg("Username must be 3–20 chars (letters/numbers/_).");
    if (available !== true) return setMsg("Please choose an available username.");

    setStatus("signing");

    try {
      // Store chosen username locally for onboarding (read-only there).
      // Avoids writing to profiles during signup (email-confirmation often has no session yet).
      localStorage.setItem("pending_username", u);
      localStorage.setItem("pending_email", email.trim());

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: origin ? `${origin}/` : undefined,
        },
      });

      if (error) {
        setStatus("error");
        setMsg(error.message);
        return;
      }

      // If confirmation is ON, session is usually null here → show "check email" state.
      if (!data.session) {
        setStatus("done");
        setMsg("Check your email to confirm your account. After confirming, log in and complete onboarding.");
        return;
      }

      // If confirmation is OFF, we have a session → go straight to onboarding.
      router.push("/onboarding");
    } catch (e: any) {
      setStatus("error");
      setMsg(e?.message || "Signup failed");
    }
  }

  const badge =
    status === "checking" ? "Checking…" : available ? "Available" : username.trim() ? "Taken" : "";

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-black/40 p-6 shadow-xl">
        <div className="text-xl font-semibold">Create your account</div>
        <div className="text-sm text-white/70 mt-1">Email + password (Supabase Auth) + username.</div>

        <div className="mt-5 space-y-4">
          <div>
            <label className="text-xs text-white/70">Email</label>
            <input
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 outline-none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="text-xs text-white/70">Password</label>
            <input
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              type="password"
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="text-xs text-white/70">Username</label>
            <div className="mt-1 flex gap-2">
              <input
                className="flex-1 rounded-lg border border-white/15 bg-black/30 px-3 py-2 outline-none"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your_name"
                autoComplete="off"
              />
              <div className="min-w-[104px] rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-center text-sm">
                {badge}
              </div>
            </div>
            <div className="mt-1 text-xs text-white/60">3–20 chars. Letters, numbers, underscore.</div>
          </div>

          {msg && <div className="text-sm text-red-300">{msg}</div>}

          <button
            onClick={onSubmit}
            disabled={status === "signing"}
            className="w-full rounded-lg bg-white text-black py-2 font-medium disabled:opacity-60"
          >
            {status === "signing" ? "Creating…" : "Create account"}
          </button>

          <div className="text-xs text-white/60">
            After signup you’ll be asked to confirm your email (if enabled). Then log in and complete onboarding.
          </div>

          <div className="flex items-center justify-between text-xs text-white/60">
            <div className="text-center text-sm text-neutral-600">
              <span>Already have an account?</span>{" "}
              <Link href="/login" className="font-medium underline underline-offset-4 hover:text-neutral-900">
                Log in
              </Link>
            </div>

            <button className="underline" onClick={() => router.push("/onboarding")} type="button">
              Continue onboarding
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
