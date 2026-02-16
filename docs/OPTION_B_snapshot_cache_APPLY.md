# Option B: Snapshot cache via session_stats

## What these files do
- Read normalized shots from `public.shots`
- Compute a deterministic `data_hash` from the shot metrics fields
- Return cached snapshot from `public.session_stats` if it exists
- Otherwise compute snapshot and `upsert` it into `public.session_stats`

## Files provided
- `latest_snapshot_route.ts`  -> replace: `app/api/sessions/latest/snapshot/route.ts`
- `session_snapshot_route.ts` -> replace: `app/api/sessions/[sessionId]/snapshot/route.ts`

## Apply (Local Windows PowerShell)
From `C:\Users\ranau\Projects\platform`:

1) Replace files
- Copy `latest_snapshot_route.ts` contents into:
  `app\api\sessions\latest\snapshot\route.ts`
- Copy `session_snapshot_route.ts` contents into:
  `app\api\sessions\[sessionId]\snapshot\route.ts`

2) Run typecheck/build
- `npm run build`

3) Commit + push
- `git add -A`
- `git commit -m "Snapshot: cache to session_stats via data_hash"`
- `git push origin main`

## Deploy (VPS)
- `cd /opt/apps/dev/stryklabs`
- `git pull origin main`
- `npm ci`
- `npm run build`
- `pm2 restart stryklabs-dev --update-env`
- `pm2 logs stryklabs-dev --lines 80`
