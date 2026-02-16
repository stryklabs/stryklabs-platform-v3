export default function CommunityPage() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold">Community</h1>
      <p className="mt-2 text-sm text-neutral-400">
        UI scaffold for Phase 9. Feed, player profiles, sharing, and moderation surfaces land here.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
          <div className="text-sm font-semibold">Feed</div>
          <div className="mt-1 text-xs text-neutral-500">Friends-only by default.</div>
          <div className="mt-4 h-28 rounded-xl border border-neutral-800 bg-neutral-900/20" />
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
          <div className="text-sm font-semibold">Leaderboard</div>
          <div className="mt-1 text-xs text-neutral-500">Performance + consistency bands.</div>
          <div className="mt-4 h-28 rounded-xl border border-neutral-800 bg-neutral-900/20" />
        </div>
      </div>
    </div>
  );
}
