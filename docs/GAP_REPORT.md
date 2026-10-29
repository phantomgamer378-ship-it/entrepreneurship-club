# GAP REPORT — Phase 0 Repository Inspection

> **Status: PRESENTED — AWAITING EXPLICIT CONFIRMATION BEFORE ANY IMPLEMENTATION (Phase 0, step 5 of the master build prompt).**
>
> Inspection date: 2026-10-26 · Inspector: coding agent (Phase 0)
> Method: direct read of repository, `prisma/schema.prisma`, `.github/workflows/ci.yml`, `tests/`, `docs/`, live database (`db/custom.db`, opened **read-only** via `scripts/phase0_db_inspect.py`), and `/home/z/my-project/worklog.md` from prior sessions.
> Nothing in the repository was modified during this inspection except the creation of this report and the read-only inspection script.

---

## 1. What actually exists (verified, not assumed)

A working platform was built in prior sessions and is currently running on port 3000:

- **Next.js 16 (App Router) + TypeScript** single-route SPA with in-app hash routing (`src/spa/`, 27 lazy-loaded views: public / auth / workspace / control).
- **Prisma ORM + SQLite** (`db/custom.db`, 26 tables) — schema covers every logical table family required by master-prompt §9 (identity/RBAC, membership, events, announcements, email outbox+delivery logs, comms, video, governance, audit, settings).
- **~40 API route handlers** under `src/app/api/` acting as the privileged backend tier (auth, public, workspace, control, cron, webhooks).
- **Deny-by-default DB-backed RBAC** (8 system roles, scoped grants, escalation guards incl. last-Super-Admin protection, grantor tracking), central `requireAuth()` choke point.
- **Email outbox** with provider interface (Console dev provider + Resend provider), atomic claims, bounded backoff, dead-letter, delivery logs, 10 HTML templates, cron worker, Resend webhook with HMAC verification.
- **socket.io mini-service** on port 3003 for realtime messaging (HTTP fallback persistence via internal-token API).
- **Video adapter** (Jitsi embed default, Daily provider code-gated on `DAILY_API_KEY`).
- **4 bun test files** (RBAC matcher, rate limiter, auth crypto, outbox invariants — 34 tests, all passing), **ESLint clean**, `ci.yml` workflow (lint → tsc → prisma validate → unit tests → build; supply-chain gates commented out with pointers).
- **12 architecture docs** in `docs/` (REQUIREMENTS, HLD, LLD, DATABASE, SECURITY, DEVOPS, AUTOMATIONS, INCIDENT_RESPONSE, BACKUP_RECOVERY, DEPLOYMENT, DECISIONS, STATUS_REPORT) and a `.env.example`.
- Browser-verified E2E in prior session: public site, member login → permission-filtered workspace, realtime messaging, super-admin control panel (11 sections), application approval flow, audit log, mobile 390px + desktop 1366px layouts. *(Reported by prior session's worklog; re-verified partially this session: both demo logins confirmed working in a real browser.)*

### Documented stack deviations (D1–D12 in `docs/DECISIONS.md`)

The master prompt specifies Supabase/Vite/Cloudflare. **No Supabase project, Resend key, or Daily key is available in this sandbox**, so the build used documented equivalents:

| Master prompt requirement | Actual implementation | Decision ref |
|---|---|---|
| Supabase Postgres + RLS | Prisma + SQLite; authorization enforced in route handlers + shared RBAC lib | D3 |
| Supabase Auth | Local credential auth (scrypt hashes, signed JWT httpOnly cookie; bearer fallback added 2026-10-26 for iframe previews) | D2 |
| Supabase Edge Functions | Next.js Route Handlers (server-only, never trusted from client) | D4 |
| Supabase Realtime | socket.io mini-service; data protected by API-tier authorization | D8 |
| Supabase Storage | URL-reference media fields (`avatarUrl`, `posterUrl`) | D6 |
| Vite + React Router + Cloudflare Pages | Next.js 16 single-route SPA (sandbox exposes only `/`) | D1 |
| Vitest / Playwright | bun test (pure-logic suites); **no browser e2e automation** | deviation |

These deviations are documented, conservative, and preserve the security posture the prompt demands (deny-by-default backend enforcement, secrets server-side only). They remain deviations, and the migration path back to the Supabase stack is described in `docs/DEPLOYMENT.md`.

---

## 2. Phase 0 step 3 — the two known prior incidents

### Incident A — test-fixture applicant rows

Named patterns from the master prompt, checked directly against the live DB:

| Pattern | Rows found |
|---|---|
| `job_persists_%` | **0** |
| `founder_resend_outage_%` | **0** |
| `outage_user_%` | **0** |

The named purge is still in effect. **However**, the inspection found a **new row of the same defect class**:

- `MemberApplication` contains **`test.user@student.adypu.edu.in` (status: approved, created by this build's own API smoke test)** — visible in the production admin UI today, exactly the failure mode Section 25 exists to prevent. It was created by a legitimate prior verification step (join → approve → invite chain), but it is a non-seed test fixture in a database real users/admins can see. One `EventRegistration` row from the same smoke session has the same status.
- **Environment guard: NOT implemented.** No `assertTestDatabase` (or equivalent) exists anywhere (`grep` over `src/`, `tests/`, `scripts/`, `prisma/` → 0 hits). `scripts/` is **empty** — no `seed-demo-data.ts`, no `purge-test-fixtures.sql`, no `purge-seed-data.sql`. Recurrence is prevented today only by the accident that the current bun tests are pure-logic (verified: no test imports the DB client), not by any guard.
- **Test database resolution statement (required by Phase 0):** the suite (`bun test`) resolves to **no Supabase URL at all** — there is no Supabase project configured in this environment. `ci.yml` sets `DATABASE_URL=file:./ci.db` (local disposable SQLite file); local runs use `db/custom.db` via `.env`. No test currently writes to any database; no allow-list mechanism enforces that this stays true.

### Incident B — seed/demo profiles with external stock-photo avatars

- `Profile.avatarUrl LIKE 'http%'`: **0 rows**. `ClubEvent.posterUrl LIKE 'http%'`: **0 rows**. The purge is still in effect; `prisma/seed.ts` does not fetch external media (placeholder content is textual and marked PLACEHOLDER).
- **BUT the structural protection is missing:** there is **no `is_seed_data` column** on `profiles`/`club_events`/`announcements` (verified against the live `Profile` column list and schema), no upload-contract validation rejecting raw external URLs for non-seed rows, and no public query-path filter — because the column does not exist. If a future seed/demo run adds a stock-photo URL, nothing in the system would stop it from rendering on the public site.

### Also found during inspection

- The 6 seeded demo users + 2 seeded applications + 3 seeded events/announcements are **indistinguishable at the data layer** from real rows (no seed flag). The README marks them demo-only in prose; the database does not.

---

## 3. Gap matrix — master prompt §5–21

Legend: ✅ Done (implemented + verified) · 🟡 Partial · ❌ Missing · ❓ Unverifiable without running tests / credentials

### §5 Public website — ✅ overall
| Item | Status |
|---|---|
| Homepage (hero, mission, stats, leadership, events, announcements, CTA, footer) | ✅ |
| Team directory (search, filters, cards, pagination) | ✅ |
| Member profiles `/members/:username` (case-insensitive unique username) | ✅ |
| Events archive (upcoming/past, detail, recaps, archiving) | ✅ |
| Announcements (public + audience-aware private) | ✅ |
| Membership application (validation, anti-spam: honeypot + time-gate + rate limit, reference code) | ✅ |
| Placeholder copy clearly marked | ✅ (seed marked PLACEHOLDER; textual only) |

### §6 Authentication & member workspace — ✅ overall, 🟡 sessions
| Item | Status |
|---|---|
| Login / accept-invite / forgot-password / reset-password | ✅ |
| Workspace dashboard, profile editing (username immutable) | ✅ |
| Session invalidation on suspend (single `requireAuth` choke point) | ✅ |
| Managed auth / MFA (§7.5 "where available") | ❌ deliberate deviation (D2); top hardening item |
| Bearer-token fallback in `localStorage` (added for iframe previews) | 🟡 functional, but weakens the httpOnly-cookie posture; acceptable for sandbox, revisit on managed-auth migration |

### §7 Administration panel — ✅ overall
| Item | Status |
|---|---|
| All 11 routes (`/control/*`), hidden from public nav | ✅ |
| Applications (notes, approve/reject, invites, resend, history) | ✅ |
| Members (invite, edit, promote/demote, suspend/reactivate, role history) | ✅ |
| Teachers (faculty invitations, reviewer permissions) | ✅ |
| Role & permission editor (scoped grants, grantor tracking, escalation guards, last-Super-Admin protection) | ✅ |
| MFA / reauthentication for sensitive actions | ❌ (see §6) |

### §8 RBAC — ✅ (centralized, deny-by-default, escalation-guarded; verified by unit tests + prior-session probes: 401/403 behavior)

### §9 Database schema — ✅ tables (all 26 present with FKs, unique constraints, timestamps, status enums; documented in DATABASE.md) · ❌ `is_seed_data` columns (Section 25.2)

### §10 RLS / API security — 🟡 equivalent posture: authorization enforced in the API tier + RBAC lib (no DB-level RLS by design D3); authorization unit tests exist; **no automated probe suite that runs against a live DB** (❓ beyond prior-session manual smoke)

### §11 Email automation — ✅ outbox, idempotency keys, bounded backoff, dead-letter, delivery logs, webhook HMAC, manual retry, Console dev provider · ❓ actual Resend delivery (no API key — explicitly unconfigured, not faked)

### §12 Event registration pipeline — ✅ (published/open/deadline/capacity checks, duplicate prevention, email confirmation queued, attendance, archiving; guest registration verified in prior smoke)

### §13 Announcement pipeline — ✅ (draft → schedule → publish → archive, audience targeting, confirmed bulk email, per-recipient status; publication decoupled from delivery)

### §14 Messaging & video — ✅ messaging (DMs/groups, persistence, realtime, unread, search, reporting/moderation; socket.io + HTTP fallback) · 🟡 video (Jitsi embed verified in-app; Daily adapter implemented but ❓ unverified, key-gated)

### §15 Animation, a11y, performance — ✅ lazy-loaded admin/messaging/video routes, skeletons, reduced-motion support, keyboard/focus handling, mobile+desktop verified · 🟡 Core Web Vitals not measured (no Lighthouse run on record)

### §16 DevOps & CI/CD — 🟡
| Item | Status |
|---|---|
| Git branch strategy / protected main | ❓ repository-hosting not in scope of sandbox |
| CI (lint, tsc, prisma validate, unit, build) | ✅ |
| Secret & dependency scanning | ❌ commented out in `ci.yml` with pointers (needs repo secrets to enable) |
| Playwright critical flows in CI | ❌ no browser e2e automation exists |
| Migration safety (version-controlled schema) | ✅ Prisma schema + `db push`; 🟡 no expand–migrate–contract runbook exercised |
| Environment separation | 🟡 dev/CI use separate SQLite files; §25.6 requires *verified* separation — not satisfied (see §2) |

### §17 Secret management — ✅ `.env.example` placeholders only; no provider secrets in frontend bundle (z-ai SDK server-only); rotation runbook in INCIDENT_RESPONSE.md · ❓ nothing to rotate (no real credentials held)

### §18 SecOps & incident response — ✅ audit events incl. all listed event types, secret redaction, rate limiting, generic anti-enumeration, 6 runbooks · 🟡 OWASP ASVS formal verification not performed

### §19 Monitoring & backups — 🟡 structured logs + dev console provider; monitoring guidance documented; **no backup pipeline executed, no restore drill** (docs/BACKUP_RECOVERY.md is a plan, not proof — per prompt, unverified backups must not be claimed)

### §20 MLOps — ✅ correctly NOT built (no approved use case), per prompt

### §21 Testing & definition of done — 🟡 34 pure-logic tests pass, lint/type-check clean, prior-session API probes + browser E2E · ❌ required Section 25 tests (guard, view exclusion, upload contract, self-cleaning) — impossible until Section 25 is built · ❌ no Playwright suite

---

## 4. Section 25 status — ALL SIX REQUIREMENTS MISSING OR UNSATISFIED

| # | Requirement | Status |
|---|---|---|
| 1 | Environment guard (`assertTestDatabase`) called by every test/seed entrypoint | ❌ absent |
| 2 | `is_seed_data` tagging + public query filtering | ❌ column does not exist |
| 3 | Upload contract (reject external URLs in media fields for non-seed rows) | ❌ absent (fields currently clean, but unenforced) |
| 4 | Self-cleaning tests / reset-between-runs | 🟡 current tests write nothing (accidentally safe); no mechanism enforces it |
| 5 | Purge scripts exist, allow-list-gated, documented in DEVOPS.md | ❌ `scripts/` is empty |
| 6 | Verified environment separation | ❌ single shared dev DB holds seed + smoke-test + "production" data (the `test.user@` row proves it) |

**Live defect of this class present right now:** `MemberApplication` row `test.user@student.adypu.edu.in` (approved) — a non-seed test fixture visible in the admin UI. One accompanying `ClubInvite` + `EventRegistration` row from the same smoke session. These require purging once requirement 5's purge script exists (the prompt forbids manual undocumented schema/data changes; the purge must be scripted and allow-list-gated).

---

## 5. Recommended remediation order (after confirmation)

1. **Section 25, immediately and in full** (per the prompt's final execution instruction — root cause of both incident classes):
   a. Add `isSeedData Boolean @default(false)` to `Profile`, `ClubEvent`, `Announcement` (+ migration via `prisma migrate`); filter `is_seed_data = false` in every public query path.
   b. Create `src/lib/test-guard.ts` (`assertTestDatabase` adapted to this stack's DATABASE_URL allow-list: local SQLite files + optional test-ref env) and call it from every test entrypoint and seed script; add a CI check that fails when a test file touches the DB without importing the guard.
   c. Create `scripts/seed-demo-data.ts` (move/tag existing seed), `scripts/purge-test-fixtures.sql` + `scripts/purge-seed-data.sql` (refuse outside allow-list), document in `docs/DEVOPS.md`.
   d. Add the four named Section 25 tests (as bun tests, matching the existing suite).
   e. Purge the live `test.user@…` fixture via the new scripted purge, and verify the admin UI no longer shows it.
2. Re-run lint/tests/browser smoke after the schema change.
3. Then resume the phase ladder at the first genuinely incomplete item per this report: §16/§21 hardening (secret scanning enablement, Playwright critical flows, backup/restore drill) — every other §5–§14 functional area is built and verified.

---

## 6. Explicit stop

Per Phase 0 step 5 of the master build prompt, this report is presented and **no further implementation has been performed**. Proceeding to Section 25 remediation (recommended order above) or any other phase requires explicit confirmation.

---

## Addendum — 2026-10-26 (Super Admin Control Suite phase)

Section 25 has since been implemented in full (carried forward per PRD §1.6): `isSeedData` columns + public query filters (25.2), `assertTestDatabase` guard in `src/lib/test-guard.ts` called by every test/seed/purge entrypoint (25.1), guarded purge scripts + `scripts/seed-demo-data.ts` (25.5), disposable local test DB reset per run + self-cleaning suite (25.4), media contract enforcement in event/profile write paths (25.3). Environment separation remains single-dev-DB (25.6 partially satisfied: dev/CI use separate SQLite files; production deployment not in sandbox scope).

The live defect listed above (`test.user@student.adypu.edu.in` approved application + matching invite/registration) was **purged via the new scripted, guard-protected purge** on 2026-10-26 — verified 0 rows remain. All named legacy incident patterns remain at 0.
