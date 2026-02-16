"use client";

import { useState } from "react";

export default function AIDock() {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40">
      <div className="mx-auto w-full max-w-5xl px-4 pb-4">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 backdrop-blur">
          {open ? (
            <div className="border-b border-neutral-800 px-4 py-3 text-sm text-neutral-200">
              <div className="flex items-center justify-between">
                <div className="font-semibold">AI Coach</div>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-900/70"
                >
                  Close
                </button>
              </div>
              <div className="mt-2 text-xs text-neutral-500">
                UI scaffold only — connect to backend chat in Phase 6.
              </div>
            </div>
          ) : null}

          <div className="flex items-center gap-2 px-3 py-3">
            <button
              onClick={() => setOpen((v) => !v)}
              className="h-10 w-10 shrink-0 rounded-xl border border-neutral-800 bg-neutral-900/40 hover:bg-neutral-900/70"
              title="Toggle AI Coach"
            >
              ✨
            </button>

            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Ask your AI Coach…"
              className="h-10 flex-1 rounded-xl border border-neutral-800 bg-neutral-950 px-3 text-sm outline-none placeholder:text-neutral-600"
            />

            <button
              onClick={() => setValue("")}
              className="h-10 rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 text-sm hover:bg-neutral-900/70"
              title="Send"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
