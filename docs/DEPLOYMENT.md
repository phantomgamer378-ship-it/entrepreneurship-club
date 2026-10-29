# DEPLOYMENT.md

## 1. What ships

| Component | Artifact | Runtime |
|---|---|---|
| Next.js app (SPA + API routes) | `next build` output | Node 20+ / Bun |
| Database | `db/custom.db` (SQLite) — swap to Postgres for scale | filesystem / managed PG |
| Realtime | `mini-services/chat-service` (socket.io) | Bun/Node, port 3003 |
| Scheduled worker | `POST /api/cron/email-worker` | any scheduler, every 5 min |

## 2. Reference topology (production intent)

```
Cloudflare Pages  ──frontend (static export of the SPA is NOT used; see note)
Cloudflare Proxy  ──► Node host running `next start`
                  ──► chat-service (private network)
Supabase Postgres ──database (migration path in DATABASE.md)
Resend            ──transactional email + webhooks
Daily / Jitsi     ──video (Daily recommended for production)
```

Note: this app uses Next.js Route Handlers, so the frontend+API deploy together (single Node service behind Cloudflare). A purely static Cloudflare Pages deployment would require extracting the API to serverless functions — documented as future work, not done.

## 3. Environment configuration

Copy `.env.example` → `.env.local` (never commit) and set:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | `file:...` or Postgres URL |
| `SESSION_SECRET` | ✅ prod | 32+ random bytes — generating: `openssl rand -base64 48` |
| `INTERNAL_SERVICE_TOKEN` | ✅ prod | shared app ↔ chat-service token |
| `CRON_SECRET` | ✅ prod | protects the worker endpoint |
| `RESEND_API_KEY` | optional | enables real email (else console dev mode) |
| `EMAIL_FROM_ADDRESS` | optional | verified sender identity |
| `RESEND_WEBHOOK_SECRET` | recommended | enables webhook signature verification |
| `DAILY_API_KEY`, `DAILY_DOMAIN` | optional | enables Daily video (else Jitsi embed) |
| `JITSI_DOMAIN` | optional | self-hosted Jitsi, default `meet.jit.si` |

Frontend code contains **no** secret material; everything sensitive is server-only.

## 4. Deploy steps (bare Node host)

```bash
# 0. Prereqs: Node 20+/Bun, reverse proxy with TLS, process supervisor
git clone <repo> && cd entrepreneurship-club
bun install --frozen-lockfile

# 1. Configure
cp .env.example .env.local   # fill production values

# 2. Database
bun run db:push              # OR prisma migrate deploy (preferred in prod)
# ⚠️ DO NOT run `bun prisma/seed.ts` in production — it creates demo accounts.

# 3. Build & run
bun run build
bun run start                # serves on :3000 (standalone output)

# 4. Realtime service
cd mini-services/chat-service && bun install && bun run dev  # :3003 (supervise in prod)

# 5. Cron
# schedule POST /api/cron/email-worker with header x-cron-secret every 5 minutes

# 6. Smoke
curl https://your-host/api/health
# expect {"status":"ok", ...}; then login and one permission-denied probe
```

## 5. Post-deploy checklist

- [ ] `/api/health` returns `ok` and the expected integration modes
- [ ] HTTPS enforced; cookies carry `Secure`
- [ ] Login works; wrong-password path audits `auth.login_failed`
- [ ] Unauthenticated `/api/control/*` returns 401; member → 403
- [ ] Public homepage, team, events, announcements render with real DB data
- [ ] Join form submits; receipt lands in Email Center (queued → sent)
- [ ] Cron worker returns summary `{"email":{"processed":...}}`
- [ ] Resend domain verified + webhook endpoint registered (when email enabled)
- [ ] Admin panel reachable at `/#/control/sign-in` (not linked publicly)
- [ ] **Seeded/demo credentials absent** (production DB starts empty of users)

## 6. Rollback

1. Redeploy previous build artifact (keep last 3 artifacts on the host).
2. `prisma migrate resolve` — never reverse migrations by hand; roll forward.
3. Rotate `SESSION_SECRET` only if the rollback is security-driven.
4. Verify with the §5 checklist.

## 7. Sandbox deployment (current)

The preview environment runs `bun run dev` (port 3000) with SQLite + console email + Jitsi embed, seeded demo data, and the chat-service on 3003. It is a functional preview — not a production configuration (no TLS termination control, in-memory rate limiting, dev provider defaults).
