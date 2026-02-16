"use client";

import { useState } from "react";

type ViewMode = "performance" | "social";

export default function ViewModeToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (mode: ViewMode) => Promise<void> | void;
}) {
  const [loading, setLoading] = useState(false);

  async function setMode(mode: ViewMode) {
    if (mode === value) return;
    try {
      setLoading(true);
      await onChange(mode);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-neutral-800 bg-neutral-950 p-1">
      <button
        type="button"
        disabled={loading}
        onClick={() => setMode("performance")}
        className={`rounded-lg px-3 py-1.5 text-sm ${
          value === "performance"
            ? "bg-neutral-900"
            : "hover:bg-neutral-900/60"
        } disabled:opacity-60`}
      >
        Performance
      </button>

      <button
        type="button"
        disabled={loading}
        onClick={() => setMode("social")}
        className={`rounded-lg px-3 py-1.5 text-sm ${
          value === "social"
            ? "bg-neutral-900"
            : "hover:bg-neutral-900/60"
        } disabled:opacity-60`}
      >
        Social
      </button>
    </div>
  );
}
