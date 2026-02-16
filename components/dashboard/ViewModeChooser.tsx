"use client";

import { useState } from "react";

type ViewMode = "performance" | "social";

export default function ViewModeChooser({
  onSelect,
}: {
  onSelect: (mode: ViewMode) => Promise<void> | void;
}) {
  const [loading, setLoading] = useState<ViewMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(mode: ViewMode) {
    try {
      setError(null);
      setLoading(mode);
      await onSelect(mode);
    } catch {
      setError("Failed to save view mode");
      setLoading(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">
        How would you like to view your progress?
      </h1>
      <p className="mt-2 text-sm text-neutral-400">
        Same data, different view. You can switch anytime.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <button
          onClick={() => pick("performance")}
          disabled={loading !== null}
          className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 text-left hover:border-neutral-700 disabled:opacity-60"
        >
          <div className="text-lg font-medium">Performance View</div>
          <div className="mt-2 text-sm text-neutral-400">
            Detailed metrics, trends, and plan structure.
          </div>
        </button>

        <button
          onClick={() => pick("social")}
          disabled={loading !== null}
          className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 text-left hover:border-neutral-700 disabled:opacity-60"
        >
          <div className="text-lg font-medium">Social View</div>
          <div className="mt-2 text-sm text-neutral-400">
            Visual patterns, confidence-first insights.
          </div>
        </button>
      </div>

      {error && (
        <div className="mt-4 text-sm text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
