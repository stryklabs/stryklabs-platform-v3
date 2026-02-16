"use client";

import { useRef, useState } from "react";

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_ORIGIN || "").replace(/\/$/, "");
const apiUrl = (p: string) => `${API_ORIGIN}${p}`;

export default function UploadPanel() {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    function pickFile() {
        setError(null);
        inputRef.current?.click();
    }

    async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        setError(null);

        try {
            const form = new FormData();
            form.append("file", file);

            const res = await fetch(apiUrl("/api/upload"), {
                method: "POST",
                body: form,
                credentials: "include",
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || "Upload failed");
            }

            // Success → dashboard
            window.location.href = "/dashboard";
        } catch (err: any) {
            setError(err.message ?? "Upload failed");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="rounded-xl border border-neutral-800 p-6">
            <input
                ref={inputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={onFile}
            />

            <button
                onClick={pickFile}
                disabled={loading}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm hover:bg-neutral-800 disabled:opacity-60"
            >
                {loading ? "Uploading…" : "Select CSV file"}
            </button>

            {error && (
                <div className="mt-3 text-sm text-red-400">
                    {error}
                </div>
            )}
        </div>
    );
}
