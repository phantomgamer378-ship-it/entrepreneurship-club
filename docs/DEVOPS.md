# DevOps — CI/CD & Operations

## 1. Repository layout (ops-relevant)

```
.github/workflows/ci.yml   CI pipeline (lint, types, tests, build, scan)
prisma/schema.prisma       version-controlled schema
prisma/seed.ts             DEMO seed (never run against production)
mini-services/chat-service realtime transport service
docs/                      architecture & runbooks
.env.example               placeholder-only configuration contract
```

## 2. Branch strategy

- `feature/*`, `fix/*`, `security/*` → protected `main`.
- Release tags `vX.Y.Z` for identifiable versions.
- Mandatory checks block merge (see CI below). No direct pushes to `main`.

## 3. CI pipeline (per pull request)

1. Install dependencies from the lockfile (`bun install --frozen-lockfile`).
2. ESLint (`bun run lint`).
3. TypeScript type check (`tsc --noEmit`).
4. Unit tests (RBAC, rate limiter, outbox state machine — `bun test` / vitest).
5. Build the frontend (`next build`) — type + bundling gate.
6. Dependency vulnerability scan (`bun pm audit --prod` or Dependabot).
7. Secret scan (gitleaks or GitHub secret scanning).
8. Validate migrations (`prisma validate`; `prisma migrate diff` against target).
9. RLS/authorization unit tests (grants resolution, scope matcher, last-super-admin logic).
10. Critical Playwright flows (public home, join submission, login, control sign-in guard) — enable when a browser runner is attached to CI.
11. Block merge if any mandatory check fails.

Pin third-party actions to full-length commit SHAs; grant `permissions: contents: read` only; never expose production secrets to PR workflows (use environment-scoped secrets for deploy jobs).

## 4. Deployment pipeline

1. Merge approved, tested change.
2. Build reproducible artifact (`next build` with lockfile deps; commit SHA stamped).
3. Deploy preview/test instance.
4. Acceptance + security smoke (health endpoint, auth denial probes).
5. Apply reviewed, backward-compatible migrations (`prisma migrate deploy`).
6. Deploy/verify Edge-equivalent functions (here: API routes + chat service + cron schedule).
7. Deploy frontend (Cloudflare Pages in the reference topology; the sandbox runs `bun run dev`/`start`).
8. Post-deploy smoke: `/api/health`, login, one permission-denied probe.
9. Record the release (tag + changelog entry).
10. Monitor; roll back by redeploying the previous artifact. **A frontend rollback does not revert migrations** — pair with `prisma migrate resolve`/forward-only fixes.

Avoid duplicate pipelines deploying the same component (one workflow owns deploy per environment).

## 5. Migration safety

- All schema changes are version-controlled (`prisma/migrations` in production mode).
- Expand → migrate → contract for breaking changes: add nullable/columns first, backfill, then drop in a later release.
- For irreversible data transformations: write the recovery SQL and restore a verified backup to a scratch DB before executing.
- Cron/worker compatibility: schema additions ship before the worker version that uses them.

## 6. Environment separation

| Env | Purpose | Data |
|---|---|---|
| development | local feature work | seeded demo (marked PLACEHOLDER) |
| staging/test | integration, cron drills, restore drills | synthetic only |
| production | the real club | real data; never experiment here |

Production accounts/credentials must not be used for casual testing. The seeded demo credentials (`ClubDemo#2024` for all seeded users) are for development only — rotate immediately in any shared environment and never seed them into production.

## 7. Scheduled work

`POST /api/cron/email-worker` (header `x-cron-secret`) every 5 minutes is sufficient:
- outbox processing with bounded retries,
- scheduled announcement publication,
- 48h event reminders,
- video room expiry.

Sandbox note: the worker also runs opportunistically after announcement fanout; in production attach a real scheduler (Supabase cron / Cloudflare cron trigger / GitHub Action schedule) calling the endpoint.

## 8. Monitoring

Start with provider dashboards + structured logs:
- app health: `GET /api/health` (database, integration modes) — uptime-check every minute;
- auth failures & authorization denials: `audit_logs` (`auth.login_failed`, `access.authorization_denied` counts);
- email queue depth/failures: `/api/control/emails` counts (`queued`, `failed`, `dead` alerting thresholds >0 sustained);
- realtime errors: chat-service logs (`[chat]` prefix);
- video failures: `video.room_access_denied` anomalies, provider dashboards;
- backup freshness: see BACKUP_RECOVERY.md checklist.

Add dedicated observability (Sentry, log drains) only when a concrete need appears — do not instrument speculatively.

## 9. Local operations cheat-sheet

```bash
bun install                # install
bun run db:push            # sync schema (dev)
bun prisma/seed.ts         # DEMO data (dev only)
bun run dev                # app on :3000
cd mini-services/chat-service && bun run dev   # realtime on :3003
bun run lint               # ESLint
bunx tsc --noEmit          # types
bun test                   # unit tests
curl -X POST localhost:3000/api/cron/email-worker -H "x-cron-secret: $CRON_SECRET"
```

---

## Data hygiene — Section 25 scripts (2026-10-26)

- `scripts/run-purge.ts` — the ONLY sanctioned way to run the purge scripts. Calls `assertTestDatabase()` (local/test allow-list) before any write. Usage: `bun scripts/run-purge.ts <fixtures|seed|dry>`.
- `scripts/purge-test-fixtures.sql` — removes test-fixture rows (incident class 1: smoke-test applicants like `test.user@*`, `e2e-*`, `job_persists_*`, …) from `MemberApplication`, `ClubInvite`, `EventRegistration`, `User`.
- `scripts/purge-seed-data.sql` — removes rows explicitly tagged `is_seed_data = true` (incident class 2) plus orphaned seed-linked users.
- `scripts/seed-demo-data.ts` — guarded demo-data entrypoint (wraps `prisma/seed.ts`; aborts on any non-test database).
- Test database: `bun run test:int` resets `db/test-suite.db` (local SQLite) before every run; the suite calls `assertTestDatabase()` at import and cleans up every row it creates (§25.4).
