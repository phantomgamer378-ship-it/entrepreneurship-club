# Entrepreneurship Club Platform

The digital platform of the **Entrepreneurship Club — ALTA School of Technology, Ajeenkya DY Patil University, Pune**: a public website, a secure member workspace, and a private administration panel on one coherent, tested codebase.

> ⚠️ **Demo notice** — this build runs in a sandbox with clearly-marked placeholder content and seeded demo accounts. Do not deploy to production without following docs/DEPLOYMENT.md (empty user table, real secrets, no demo seed).

## Quick start

```bash
bun install
cp .env.example .env.local        # dev defaults work out of the box
bun run db:push                   # create/sync SQLite schema
bun prisma/seed.ts                # ⚠️ DEMO data only — never in production
bun run dev                       # app on :3000

# realtime messaging service (second terminal)
cd mini-services/chat-service && bun install && bun run dev   # :3003
```



Public site: `/#/` · Member workspace: `/#/workspace` · Admin: `/#/control/sign-in` (not linked from public nav).

## Feature map

| Area | Highlights |
|---|---|
| **Public site** | Home (hero, mission, stats, leadership, events, announcements), team directory with search/filter/pagination, member profiles, events archive with registration + recaps, audience-aware announcements, resources, membership application (honeypot + time-gate + rate limiting + reference code) |
| **Auth** | Credential login, invitation-based activation (single-use hashed tokens, 7-day expiry, resend rotation), password reset (1h, single-use), generic anti-enumeration responses |
| **Member workspace** | Dashboard, profile editing (username immutable), realtime direct/group messaging (socket.io + HTTP fallback, unread counts, typing, reporting), video meetings (create/invite/join/end, expiring rooms, screen share via provider), notifications |
| **Control panel** | Overview KPIs, application review (private notes, approve/reject → decision + invite emails), member/teacher management, suspend/reactivate, role & permission editor (scoped grants, custom roles, grantor tracking), events (publish/complete/archive, attendance), announcements (draft→schedule→publish→archive, confirmed bulk email with per-recipient status), Email Center (outbox, retries, delivery logs, provider mode), moderation queue, audit log, club settings |
| **Automation** | Email outbox (idempotency keys, bounded retries + backoff, dead-letter, delivery webhooks), 10 email categories, scheduled announcements, 48h event reminders, room expiry |
| **Security** | Deny-by-default DB-backed RBAC (8 roles, scoped grants), escalation guards (grant-what-you-hold, Super-Admin-only admin roles, last-Super-Admin protection), structured audit events with secret redaction, rate limiting, security docs + runbooks |

## Testing

```bash
bun run lint          # ESLint (Next.js + react-hooks rules)
bunx tsc --noEmit     # strict TypeScript
bun test              # 34 unit tests: RBAC matcher, rate limiter, crypto, outbox invariants
```

API-level behavior was additionally smoke-tested end-to-end (login/401/403 probes, join → review → approve → invite, guest event registration, email worker processing). See docs/STATUS_REPORT.md for exactly what is verified vs unverified.

## Documentation

| Doc | Contents |
|---|---|
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | product requirements + implementation status |
| [docs/HLD.md](docs/HLD.md) | architecture, modules, environments |
| [docs/LLD.md](docs/LLD.md) | routing, auth internals, pipelines, socket protocol |
| [docs/DATABASE.md](docs/DATABASE.md) | 24-table schema, constraints, RLS-equivalent policy map, Postgres migration |
| [docs/SECURITY.md](docs/SECURITY.md) | OWASP alignment, threat register, secret runbook |
| [docs/DEVOPS.md](docs/DEVOPS.md) | CI/CD, branches, migration safety, monitoring |
| [docs/AUTOMATIONS.md](docs/AUTOMATIONS.md) | email categories, outbox state machine, pipelines |
| [docs/INCIDENT_RESPONSE.md](docs/INCIDENT_RESPONSE.md) | six runbooks (leaked secret, compromised admin, …) |
| [docs/BACKUP_RECOVERY.md](docs/BACKUP_RECOVERY.md) | backup pipeline, restore drills, RPO/RTO |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | deploy steps, env matrix, rollback |
| [docs/DECISIONS.md](docs/DECISIONS.md) | 12 ADRs incl. every stack adaptation |
| [docs/STATUS_REPORT.md](docs/STATUS_REPORT.md) | **final implementation status: done / unverified / next steps** |

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · shadcn/ui · TanStack Query · Zod · Prisma + SQLite (Postgres-ready) · socket.io · framer-motion · Bun.

Deviations from the master prompt's Vite/Supabase stack are **deliberate and documented** in [docs/DECISIONS.md](docs/DECISIONS.md) (sandbox constraints; provider adapters keep the swap paths open).

