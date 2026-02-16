# STRYKLabs Platform – Directory Cheat Sheet

Canonical reference of directories and files to avoid guesswork.

## Root
- **M5_plan_week_journal.sql** — SQL / diagnostics / migration
- **README.md** — Documentation
- **eslint.config.mjs** — Asset / other
- **middleware.ts** — TypeScript logic / module
- **next-env.d.ts** — TypeScript logic / module
- **next.config.ts** — TypeScript logic / module
- **package-lock.json** — Config / schema
- **package.json** — Config / schema
- **postcss.config.mjs** — Asset / other
- **tsconfig.json** — Config / schema

## app
- **favicon.ico** — Asset / other
- **globals.css** — Asset / other
- **layout.tsx** — React UI component
- **page.tsx** — React UI component

## app/(app)
- **layout.tsx** — React UI component

## app/(app)/admin
- (no files)

## app/(app)/admin/coaching-ops
- **page.tsx** — React UI component

## app/(app)/admin/plan3m
- **page.tsx** — React UI component

## app/(app)/dashboard
- **HomePerformance.tsx** — React UI component
- **HomeSocial.tsx** — React UI component
- **page.tsx** — React UI component

## app/(app)/dashboard/sessions
- **SessionsExplorer.tsx** — React UI component
- **page.tsx** — React UI component

## app/(app)/progression
- **page.tsx** — React UI component

## app/(app)/smart-bag
- **page.tsx** — React UI component

## app/(app)/upload
- **UploadPanel.tsx** — React UI component
- **page.tsx** — React UI component

## app/(auth)
- (no files)

## app/(auth)/onboarding
- **page.tsx** — React UI component

## app/(auth)/signup
- **page.tsx** — React UI component

## app/(public)
- **layout.tsx** — React UI component

## app/(public)/login
- **LoginForm.tsx** — React UI component
- **page.tsx** — React UI component

## app/admin
- **layout.tsx** — React UI component
- **page.tsx** — React UI component

## app/admin/clients
- **page.tsx** — React UI component

## app/admin/sessions
- (no files)

## app/admin/sessions/[sessionId]
- **SessionDetailClient.tsx** — React UI component
- **SessionDetailGate.tsx** — React UI component
- **page.tsx** — React UI component

## app/admin/telemetry
- **page.tsx** — React UI component

## app/admin/upload
- **page.tsx** — React UI component

## app/api
- (no files)

## app/api/admin
- (no files)

## app/api/admin/clients
- (no files)

## app/api/admin/clients/create
- **route.ts** — API route / request handler

## app/api/admin/clients/list
- **route.ts** — API route / request handler

## app/api/admin/coaching
- (no files)

## app/api/admin/coaching/ops
- (no files)

## app/api/admin/coaching/ops/plan3m
- **route.ts** — API route / request handler

## app/api/admin/coaching/ops/sessioncoach
- **route.ts** — API route / request handler

## app/api/admin/coaching/plan3m
- (no files)

## app/api/admin/coaching/plan3m/activate
- **route.ts** — API route / request handler

## app/api/admin/coaching/plan3m/active
- **route.ts** — API route / request handler

## app/api/admin/coaching/plan3m/create
- **route.ts** — API route / request handler

## app/api/admin/coaching/plan3m/drafts
- **route.ts** — API route / request handler

## app/api/admin/coaching/plan3m/guidance
- (no files)

## app/api/admin/coaching/plan3m/guidance/generate
- **route.ts** — API route / request handler

## app/api/admin/coaching/plan3m/regen
- **route.ts** — API route / request handler

## app/api/admin/coaching/plan3m/retire
- **route.ts** — API route / request handler

## app/api/admin/coaching/plan3m/version
- **route.ts** — API route / request handler

## app/api/admin/coaching/plan6m
- (no files)

## app/api/admin/coaching/plan6m/activate
- **route.ts** — API route / request handler

## app/api/admin/coaching/plan6m/active
- **route.ts** — API route / request handler

## app/api/admin/coaching/plan6m/drafts
- **route.ts** — API route / request handler

## app/api/admin/coaching/plan6m/regen
- **route.ts** — API route / request handler

## app/api/admin/coaching/regen
- **route.ts** — API route / request handler

## app/api/admin/sessions
- (no files)

## app/api/admin/sessions/list
- **route.ts** — API route / request handler

## app/api/admin/sessions/[sessionId]
- (no files)

## app/api/admin/sessions/[sessionId]/shots
- **route.ts** — API route / request handler

## app/api/admin/telemetry
- (no files)

## app/api/admin/telemetry/coaching
- **route.ts** — API route / request handler

## app/api/auth
- (no files)

## app/api/auth/logout
- **route.ts** — API route / request handler

## app/api/auth/user
- **route.ts** — API route / request handler

## app/api/auth/username-available
- **route.ts** — API route / request handler
- **signup_profile_v1_README.txt** — Asset / other

## app/api/bag
- (no files)

## app/api/bag/customise
- **route.ts** — API route / request handler

## app/api/bag/latest
- **route.ts** — API route / request handler

## app/api/bag/leaderboard
- **route.ts** — API route / request handler

## app/api/coaching
- (no files)

## app/api/coaching/generate
- **route.ts** — API route / request handler

## app/api/coaching/panel
- **route.ts** — API route / request handler

## app/api/coaching/panel/session
- **route.ts** — API route / request handler

## app/api/coaching/plan3m
- (no files)

## app/api/coaching/plan3m/active
- **route.ts** — API route / request handler

## app/api/coaching/plan6m
- (no files)

## app/api/coaching/plan6m/active
- **route.ts** — API route / request handler

## app/api/coaching/sessioncoach
- (no files)

## app/api/coaching/sessioncoach/create
- **route.ts** — API route / request handler

## app/api/coaching/sessioncoach/create/session
- **route.ts** — API route / request handler

## app/api/coaching/sessioncoach/get
- **route.ts** — API route / request handler

## app/api/internal
- (no files)

## app/api/internal/bag
- (no files)

## app/api/internal/bag/recompute
- **route.ts** — API route / request handler

## app/api/internal/coaching
- (no files)

## app/api/internal/coaching/generate
- **route.ts** — API route / request handler

## app/api/internal/compute
- (no files)

## app/api/internal/compute/session
- **route.ts** — API route / request handler

## app/api/internal/health
- (no files)

## app/api/internal/health/coaching
- **route.ts** — API route / request handler

## app/api/internal/plan3m
- (no files)

## app/api/internal/plan3m/ensure
- **route.ts** — API route / request handler

## app/api/internal/stats
- (no files)

## app/api/internal/stats/recompute
- **route.ts** — API route / request handler

## app/api/profile
- (no files)

## app/api/profile/upsert
- **route.ts** — API route / request handler

## app/api/profile/view-mode
- **route.ts** — API route / request handler

## app/api/progress
- **route.ts** — API route / request handler

## app/api/progress/plan3m
- (no files)

## app/api/progress/plan3m/journal
- **route.ts** — API route / request handler

## app/api/progress/plan3m/week-status
- **route.ts** — API route / request handler

## app/api/progression
- (no files)

## app/api/progression/guidance
- (no files)

## app/api/progression/guidance/decide
- **route.ts** — API route / request handler

## app/api/progression/plan3m
- (no files)

## app/api/progression/plan3m/guidance
- **route.ts** — API route / request handler

## app/api/progression/plan6m
- (no files)

## app/api/progression/plan6m/guidance
- **route.ts** — API route / request handler

## app/api/session
- (no files)

## app/api/session/compute
- **route.ts** — API route / request handler

## app/api/sessions
- (no files)

## app/api/sessions/latest
- (no files)

## app/api/sessions/latest/snapshot
- **route.ts** — API route / request handler

## app/api/sessions/latest/stats
- **route.ts** — API route / request handler

## app/api/sessions/list
- **route.ts** — API route / request handler

## app/api/sessions/[sessionId]
- (no files)

## app/api/sessions/[sessionId]/coaching
- **route.ts** — API route / request handler

## app/api/sessions/[sessionId]/coaching/explain
- **route.ts** — API route / request handler

## app/api/sessions/[sessionId]/shots
- **route.ts** — API route / request handler

## app/api/sessions/[sessionId]/snapshot
- **route.ts** — API route / request handler

## app/api/sessions/[sessionId]/versions
- **route.ts** — API route / request handler

## app/api/upload
- **route.ts** — API route / request handler

## app/api/upload/sessions
- **route.ts** — API route / request handler

## app/api/upload/sessions/[sessionId]
- (no files)

## app/api/upload/sessions/[sessionId]/shots
- **route.ts** — API route / request handler

## app/api/whoami
- **route.ts** — API route / request handler

## app/lib
- **supabaseClient.ts** — TypeScript logic / module
- **userContext.ts** — TypeScript logic / module

## app/lib/auth
- **resolveClientId.ts** — TypeScript logic / module

## app/lib/supabase
- **server.ts** — TypeScript logic / module

## app/sessions
- (no files)

## app/sessions/[sessionId]
- **page.tsx** — React UI component

## components
- (no files)

## components/dashboard
- **ViewModeChooser.tsx** — React UI component
- **ViewModeToggle.tsx** — React UI component

## components/layout
- **VerticalResizeSplit.tsx** — React UI component

## components/sessions
- **SessionsContext.tsx** — React UI component

## components/shell
- **ContextPanelGate.tsx** — React UI component
- **LeftContextNav.tsx** — React UI component
- **LeftMenu.tsx** — React UI component
- **SmartBagShell.tsx** — React UI component
- **TopBar.tsx** — React UI component

## components/ui
- **AppErrorState.tsx** — React UI component
- **AppLoadingState.tsx** — React UI component
- **EmptyState.tsx** — React UI component
- **Panel.tsx** — React UI component

## docs
- **OPTION_B_snapshot_cache_APPLY.md** — Documentation
- **smart-bag_ui_shell_README.txt** — Asset / other

## docs/schemas
- **coaching_output_v1.json** — Config / schema

## lib
- **supabaseClient.ts** — TypeScript logic / module

## lib/ai
- **pricing.ts** — TypeScript logic / module

## lib/analytics
- **signalsV1.ts** — TypeScript logic / module

## lib/metrics
- **snapshot.ts** — TypeScript logic / module

## lib/parsers
- **skytrak_v1.ts** — TypeScript logic / module

## lib/supabase
- **browser.ts** — TypeScript logic / module
- **server.ts** — TypeScript logic / module
- **useSupabase.ts** — TypeScript logic / module

## public
- **file.svg** — Asset / other
- **globe.svg** — Asset / other
- **next.svg** — Asset / other
- **vercel.svg** — Asset / other
- **window.svg** — Asset / other
