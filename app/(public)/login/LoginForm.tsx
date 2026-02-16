"use client";

import { useState } from "react";
import { useSupabase } from "@/lib/supabase/useSupabase";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Patch B: deterministic post-login routing
 * - If /login?next=/some/path, redirect there after sign-in
 * - Fallback to /dashboard
 */
function safeNext(next: string | null): string | null {
    if (!next) return null;
    if (!next.startsWith("/")) return null;
    if (next.startsWith("//")) return null;
    if (next.includes("http://") || next.includes("https://")) return null;
    return next;
}

export default function LoginForm() {
    const supabase = useSupabase();
    const router = useRouter();
    const searchParams = useSearchParams();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        if (!supabase) {
            setError("Auth client not ready. Please refresh and try again.");
            return;
        }

        setLoading(true);

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        setLoading(false);

        if (error) {
            setError(error.message);
            return;
        }

        const next = safeNext(searchParams.get("next")) ?? "/dashboard";
        router.replace(next);
        router.refresh();
    }

    return (
        <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-xl">
            <h1 className="text-xl font-semibold">Sign in</h1>
            <p className="mt-1 text-sm text-neutral-400">
                Access your STRYKLabs dashboard
            </p>

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
                <div>
                    <label className="block text-sm text-neutral-400 mb-1">
                        Email
                    </label>
                    <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-600"
                    />
                </div>

                <div>
                    <label className="block text-sm text-neutral-400 mb-1">
                        Password
                    </label>
                    <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-600"
                    />
                </div>

                {error && (
                    <div className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-400">
                        {error}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-60"
                >
                    {loading ? "Signing in…" : "Sign in"}
                </button>
            </form>
        </div>
    );
}
