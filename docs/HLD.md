# High-Level Design (HLD)

## 1. Deployment context

This build targets the sandbox runtime: a single Next.js 16 application (App Router) with a SQLite database, one socket.io mini-service, and provider adapters for email/video. The logical architecture maps 1:1 to the target production topology (React SPA + managed Postgres + serverless functions), documented in `docs/DECISIONS.md`.

```
┌────────────────────────────────────────────────────────────────────┐
│ Browser                                                            │
│  React 19 SPA (hash-routed views under /)                          │
│  - Public site · Member workspace · Control panel (lazy bundles)   │
└──────┬──────────────────────────────┬──────────────────────────────┘
       │ HTTPS (session cookie)       │ WebSocket (gateway)
       ▼                              ▼
┌──────────────────────────────┐  ┌───────────────────────────────┐
│ Next.js server               │  │ chat-service (socket.io:3003) │
│  Route Handlers /api/*       │◄─┤ transport only; validates via │
│  - auth, public, workspace   │  │ /api/internal/chat            │
│  - control, cron, webhooks   │  └───────────────────────────────┘
│  - Authorization core        │
│  (deny by default)           │
└──────┬───────────────────────┘
       ▼
┌──────────────────────────────┐     ┌──────────────────────────────┐
│ SQLite (Prisma)              │     │ External providers           │
│  24 tables — see DATABASE.md │     │  Resend (email, optional)    │
└──────────────────────────────┘     │  Jitsi embed / Daily (video) │
                                     └──────────────────────────────┘
```

## 2. Logical flow

1. Browser → React SPA → API route handlers → authorization core → Prisma → SQLite.
2. Privileged/side-effecting operations (email fanout, cron, webhooks, chat persistence) always pass through server-side handlers — the browser never holds a privileged credential.
3. Email: business operation persists records first, then enqueues to `email_outbox`; a worker (cron endpoint, opportunistic pass) delivers with bounded retries; provider webhooks finalize delivery states.
4. Video: the server validates room access and returns provider join info; media flows peer-to-provider, never through this platform.

## 3. Modules

| Module | Location | Responsibility |
|---|---|---|
| SPA shell | `src/spa/app.tsx`, `router.tsx` | providers, hash routing, layout selection, code splitting |
| Public pages | `src/spa/pages/public/*` | discovery surfaces (§5) |
| Auth pages | `src/spa/pages/auth/*` | login, invite acceptance, recovery |
| Workspace | `src/spa/pages/workspace/*` | dashboard, profile, messages, meetings |
| Control panel | `src/spa/pages/control/*` | administration surfaces |
| API: auth | `src/app/api/auth/*` | credential sessions, invites, resets |
| API: public | `src/app/api/public/*` | read-only discovery + application/registration writes |
| API: workspace | `src/app/api/workspace/*` | member-scoped operations |
| API: control | `src/app/api/control/*` | permission-gated administration |
| API: ops | `src/app/api/cron/*`, `src/app/api/webhooks/*`, `src/app/api/internal/*` | scheduled work, provider callbacks, service-to-service |
| Authorization | `src/lib/rbac/*` | permission catalog, grant resolution, checks |
| Email engine | `src/lib/email/*` | provider interface, outbox state machine, templates |
| Video adapter | `src/lib/video/*` | provider interface, room access validation |
| Realtime | `mini-services/chat-service` | socket.io fanout (no direct DB access) |
| Audit | `src/lib/audit.ts` | structured security/operational events |
| Rate limiting | `src/lib/ratelimit.ts` | in-memory sliding window |

## 4. Key design decisions

- **Single-route SPA** — the sandbox exposes only `/`; hash routing gives deep links (`/#/control/applications`) without server config. See DECISIONS D1.
- **Authorization at one choke point** — every route handler resolves the session and re-checks permission against fresh DB grants; role snapshots in tokens are never authoritative.
- **Outbox over direct-send** — no business flow depends on the email provider being available; retries are bounded and idempotent.
- **Transport-only realtime** — the socket service holds no secrets beyond an internal token and performs no DB writes; all validation/persistence is delegated to the app.
- **Provider adapters** — email and video are swappable without touching business logic; unconfigured providers degrade to clearly-labeled dev modes rather than fake success.

## 5. Environments

| Environment | Database | Email | Video | Notes |
|---|---|---|---|---|
| Development (this repo) | SQLite `db/custom.db` | Console provider (dev mode) | Jitsi embed | seeded demo data, clearly marked |
| Staging (recommended) | separate SQLite/Postgres file or DB | Resend test domain | Jitsi/Daily test | run cron worker frequently |
| Production | managed Postgres (migration guide in DATABASE.md) | Resend + webhook secret | Daily (recommended) | secrets from provider store; rotate seeded credentials |

## 6. Scaling path

- SQLite → Postgres (Prisma provider swap; SQL is standard).
- In-memory rate limiter → shared store (Redis/Upstash) when horizontally scaled.
- Socket service → multiple nodes with a Redis adapter; membership validation already externalized.
- Static assets/uploads → object storage (Supabase Storage/S3-compatible) with signed URLs.
