export default function HomePerformance() {
  return (
    <div className="grid gap-6">
      <div className="rounded-xl border border-neutral-800 p-6">
        <div className="text-sm opacity-70">Performance Overview</div>
        <div className="mt-2 text-neutral-400">
          KPIs, trends, progression summaries.
        </div>
      </div>

      <div className="rounded-xl border border-neutral-800 p-6">
        <div className="text-sm opacity-70">Coaching Summary</div>
        <div className="mt-2 text-neutral-400">
          Latest plan guidance (designed output later).
        </div>
      </div>
    </div>
  );
}
