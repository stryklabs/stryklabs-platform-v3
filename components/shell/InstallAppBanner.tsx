"use client";

import { useEffect, useState } from "react";

export default function InstallAppBanner() {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(window.localStorage.getItem("stryklabs_install_banner") === "1");
  }, []);

  if (dismissed) return null;

  return (
    <div className="md:hidden border-b border-neutral-800 bg-neutral-950 px-4 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-neutral-100">Install STRYKLabs</div>
          <div className="text-[11px] text-neutral-500 truncate">
            For Play capture + offline-first experience.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="h-8 rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 text-xs hover:bg-neutral-900/70"
            onClick={() => {
              // UI-only: native install flow handled later by native app.
              window.location.href = "/play";
            }}
          >
            Open
          </button>
          <button
            className="h-8 rounded-lg border border-neutral-800 bg-neutral-950 px-3 text-xs text-neutral-400 hover:bg-neutral-900/40"
            onClick={() => {
              window.localStorage.setItem("stryklabs_install_banner", "1");
              setDismissed(true);
            }}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
