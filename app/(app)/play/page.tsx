export default function PlayPage() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold">Play</h1>
      <p className="mt-2 text-sm text-neutral-400">
        Native iOS capture (Phase 7) + on-course advisor (Phase 8). Web UI shows a lightweight bridge.
      </p>

      <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
        <div className="text-sm font-semibold">Capture status</div>
        <div className="mt-1 text-xs text-neutral-500">Connect device + start session.</div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            { t: "Course", v: "—" },
            { t: "Hole", v: "—" },
            { t: "Advisor", v: "—" },
          ].map((x) => (
            <div key={x.t} className="rounded-xl border border-neutral-800 bg-neutral-900/20 p-4">
              <div className="text-[11px] text-neutral-500">{x.t}</div>
              <div className="mt-1 text-sm text-neutral-200">{x.v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
