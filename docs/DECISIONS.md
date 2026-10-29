# DECISIONS.md — Architecture Decision Records

Format: lightweight ADR. Status: Accepted unless noted.

---

## D1 · Single-route SPA with hash routing
- **Context**: The sandbox runtime exposes only the `/` page route to visitors; the platform needs ~27 distinct views with deep links (control panel, member profiles, event pages).
- **Decision**: Ship one client-side SPA mounted at `/` using hash routing (`#/team`, `#/control/applications`). All server capability lives in Route Handlers under `/api/*`.
- **Consequences**: Deep links work on refresh without server rewrites; SEO is limited for content pages (acceptable for a club platform; server rendering can be restored by promoting views to real App Router pages — components are already view-shaped).
- **Alternatives**: Multi-route App Router pages (rejected: runtime constraint); single mega-page without routing (rejected: usability).

## D2 · Local credential auth instead of Supabase Auth
- **Context**: Supabase is unavailable in this deployment (no project/credentials). The master prompt forbids custom auth *when a managed service can satisfy the requirement*; working rule 10 covers the unavailable-credentials case.
- **Decision**: Implement local auth (scrypt hashes, httpOnly JWT session cookies, invitation activation, single-use reset tokens) behind the same conceptual boundary; document the Supabase Auth migration path (swap `requireAuth()` to verify Supabase sessions; keep the authorization core untouched).
- **Consequences**: Full functionality today with honest limitations (no MFA, no OAuth); the RBAC core is provider-agnostic.
- **Status**: Accepted with a tracked migration note in STATUS_REPORT.md.

## D3 · Prisma + SQLite instead of Supabase Postgres/RLS
- **Context**: No Supabase project available; SQLite is the provisioned database.
- **Decision**: Mirror the required logical schema exactly (24 tables) in Prisma; enforce the RLS-equivalent policy set in one server-side authorization layer (every route + the internal chat contract); document per-row policy translations for a future Postgres move.
- **Consequences**: All §10 guarantees hold via construction (no client-side DB access exists at all — a stronger single choke point than permissive-RLS-by-default), at the cost of not having defense-in-depth inside the DB engine yet.

## D4 · Next.js Route Handlers as the "Edge Functions" tier
- **Context**: Supabase Edge Functions unavailable; privileged operations (decision emails, fanout, room credentials) need a trusted backend.
- **Decision**: All privileged operations run in Route Handlers with the authorization core; the chat mini-service is transport-only and calls `/api/internal/chat` with a shared token.
- **Consequences**: One authorization code path; straightforward later extraction to Edge Functions/serverless.

## D5 · Outbox email with Console/Resend providers
- **Context**: Resend is the target provider but no API key exists here; business flows must not depend on provider availability.
- **Decision**: Outbox table + worker with idempotency keys, atomic claims, bounded backoff, dead-lettering, delivery logs, signature-verified webhooks; Console provider is the dev default and is labeled everywhere it surfaces.
- **Consequences**: No fake "delivered" claims; flipping to real email is a configuration change.

## D6 · URL-reference media instead of binary uploads
- **Context**: Supabase Storage unavailable; implementing a secure binary upload pipeline (validation, storage policies, AV scanning) is its own project.
- **Decision**: Profiles/events accept poster/avatar URLs in this release; no binary upload endpoint exists. A production storage integration must add ownership-scoped storage policies before enabling uploads.
- **Consequences**: Honest scope cut; eliminates upload-RCE/XSS vectors today. *(Status: documented limitation.)*

## D7 · Jitsi embed default; Daily adapter implemented but gated
- **Context**: Master prompt offers Daily **or** Jitsi after verifying limits/terms. Daily requires an API key (absent); public meet.jit.si works keylessly.
- **Decision**: `VideoProvider` interface with `JitsiEmbedProvider` (default) and `DailyProvider` (active iff `DAILY_API_KEY`). Room access is always validated server-side; join info is issued only to authorized users; rooms expire (24h default) and are reaped by cron.
- **Consequences**: Working multi-participant meetings + screen share now (within meet.jit.si free-tier characteristics, e.g. public rooms); production-grade control needs Daily or self-hosted Jitsi.

## D8 · socket.io mini-service for realtime
- **Context**: Master prompt requires realtime messaging; the runtime's realtime path is a dedicated socket.io service behind the gateway.
- **Decision**: `mini-services/chat-service` handles transport (rooms, typing, fanout). Every persistence and membership validation is delegated to `/api/internal/chat` (single writer, single authorization point).
- **Consequences**: No cross-process DB contention; the socket layer can be restarted/horizontally scaled without data risk. RLS rule respected: data stays protected regardless of subscription configuration.

## D9 · Deny-by-default RBAC with scopes + escalation guards
- **Context**: §8 requires DB-backed RBAC, resource scoping, and self-escalation prevention.
- **Decision**: Grants = role grants ∩ assignment scopes + per-user grants; scope grammar `*` | `type:{id}`; guards: grant-what-you-hold, Super-Admin-only admin roles, last-Super-Admin protection, self-suspension block, immutable system Super Admin permissions.
- **Consequences**: Small pure core (`canWithGrants`) that is unit-testable without a DB.

## D10 · Demo seed data marked as PLACEHOLDER
- **Context**: The platform needs content to be reviewable, but §23.11 forbids fabricated records in production.
- **Decision**: Seed script creates clearly-marked `[PLACEHOLDER CONTENT]` demo users/events/announcements with a shared demo password, documented as development-only; production checklist requires an empty user table (no seed) and real content via the admin panel.
- **Consequences**: Honest demo experience; explicit production guardrail.

## D11 · English (en-IN) as the product language
- **Context**: Master prompt is written in English; the institution is in Pune, India.
- **Decision**: UI copy, emails, and documentation in English; date/number formatting via `en-IN`.
- **Alternatives**: Bilingual support (future; next-intl is available if needed).

## D12 · In-memory rate limiting
- **Context**: Single-instance sandbox; §10 requires rate limiting on sensitive flows.
- **Decision**: Sliding-window limiter in process memory for login/join/registration/reset/cron-adjacent flows.
- **Consequences**: Adequate for single-instance; must move to a shared store (Upstash/Redis) before horizontal scaling — tracked in HLD scaling notes.

## D13 · Section 25 adaptation for SQLite + URL-reference media
The seed-isolation requirements are enforced with Prisma columns (`isSeedData`), application-layer public query filters, and an allow-list media contract (`src/lib/media.ts`, allow-list = `MEDIA_HOST_ALLOWLIST`, default `res.cloudinary.com`; seed rows exempt). After the Supabase Storage migration, the allow-list becomes the storage bucket host and `assertMediaContract` moves to the storage upload path. Public pages in dev therefore show an empty directory/events/announcements until real (non-seed) content is created or the data is un-tagged — this is the specified behavior, not a bug.

## D14 · Broadcast audience resolution is the single seed-exclusion choke point
`resolveBroadcastAudience()` (src/lib/admin/broadcast-meeting.ts) excludes `isSeedData` profiles, inactive and suspended accounts for ALL audience types — including direct invites — so a real broadcast can never invite a demo row, independent of the UI.
