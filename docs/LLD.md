# Low-Level Design (LLD)

## 1. SPA architecture

### Routing (hash-based)
- `src/spa/router.tsx` — `parseHash()`, `matchRoute('members/:username', path)`, `Router` with lazy `RouteDef[]`.
- Route families (src/spa/app.tsx): `PUBLIC_ROUTES`, `AUTH_ROUTES`, `WORKSPACE_ROUTES`, `CONTROL_ROUTES`; layout chosen by prefix match; admin/messaging/video bundles are code-split via `lazyPage`.

### State
- **Server state** — TanStack Query (`staleTime 15s`, retry 1, no window refetch); keys: `['team', q, role, page]`, `['event', slug]`, `['conversations']`, `['ctl-*']`.
- **Auth** — React context (`src/spa/stores/auth.tsx`); session fetched from `/api/auth/session`; exposes `permissions` for cosmetic UI gating only.
- **Realtime** — singleton socket (`getSocket()`) connecting `io('/?XTransformPort=3003')`; events: `authenticate`, `join_conversation`, `leave_conversation`, `send_message`, `typing` (client→server); `message`, `typing`, `message_rejected`, `conversation_denied` (server→client). HTTP PUT fallback when socket is disconnected.

## 2. Authorization core (src/lib/rbac)

- `getUserGrants(userId)` → union of role grants (assignment scope ∩ grant scope) + per-user grants; excludes expired/suspended/inactive; 5s memo cache with explicit invalidation (`revalidateUserGrants`) after every role/permission mutation.
- `can(userId, permission, resource?)` / `requirePermission(...)` — pure matcher `canWithGrants` exported for unit tests.
- Scope grammar: `*` (global) | `{type}:{id}` (resource) | `{type}:*` (type-wide).
- Guards implemented at route level:
  - last-active-Super-Admin protection (suspend/demote) — `activeSuperAdminCount()`
  - grant-what-you-hold escalation guard (`PUT /api/control/roles`)
  - admin/super_admin role assignment restricted to Super Admin
  - `access.authorization_denied` audit event on every denial

## 3. Auth internals

- Passwords: `scrypt$16384$8$1$salt$hash` (node:crypto), constant-time compare.
- Sessions: HS256 JWT (`jose`) in `ec_session` httpOnly/SameSite=Lax cookie, 8h TTL; `requireAuth()` re-loads the user row each request (suspension is enforced instantly).
- Invites (`club_invites`): 32-byte random token, only SHA-256 hash stored; 7-day expiry; single-use (`status` transition + unique token); resend rotates the token, invalidating the old link.
- Reset tokens (`password_reset_tokens`): 1h expiry, single-use; completing a reset invalidates siblings.

## 4. Email engine

- `enqueueEmail` — idempotent on `idempotencyKey` (unique index); safe under concurrency.
- `processOutbox(limit)` — claims jobs atomically via conditional `updateMany` (status queued/failed → sending); on success records `providerMessageId`; on failure: backoff schedule `[1m, 5m, 30m, 2h]`, `status='dead'` at `maxAttempts` (5) + `email.delivery_failed` audit.
- `retryEmail` — admin action, only for failed/dead.
- Webhook (`POST /api/webhooks/resend`) — HMAC-SHA256 over raw body vs `RESEND_WEBHOOK_SECRET` (svix-style); rejected when unverified in production posture; maps `email.sent|delivered|bounced|complained|opened` to `email_delivery_logs`.

## 5. Pipelines

### Application review (POST /api/control/applications/[id]/decision)
```
verify applications.approve|reject → assert status=pending → update (status, notes, reviewer, time)
→ enqueue decision email → if approve: ensure single pending invite → create token → enqueue invite email
→ audit membership.application_approved|rejected
```

### Announcement email fanout (POST /api/control/announcements/[id]/email)
```
verify announcements.email.send → require confirm:true → assert published
→ resolve recipients by audience ∩ active ∩ announcementEmails opt-in
→ per recipient: find-or-create announcement_recipients (unique[announcement,email]) → enqueue outbox job
→ opportunistic processOutbox → sync recipient status from outbox → audit announcement.email_queued
```

### Event registration (POST /api/public/events/[slug]/register)
```
rate limit → resolve member or guest(identity) → assert published ∧ open ∧ !past ∧ deadline OK
→ duplicate check (eventId+regKey unique) → capacity check → create/restore registration
→ audit → enqueue confirmation (idempotencyKey event-reg-{id}) → return counts
```

### Cron worker (POST /api/cron/email-worker, header x-cron-secret)
1. `processOutbox(25)` 2. publish due scheduled announcements 3. queue 48h event reminders (idempotent `event-reminder-{event}-{email}`) 4. expire video rooms.

## 6. Realtime message flow

```
client ──socket emit send_message──► chat-service
chat-service ──POST /api/internal/chat (x-internal-token)──► app: validate membership + persist
app ──message JSON──► chat-service ──io.to(conversationId)──► all room members
```
The service trusts only the internal-token header + DB-backed membership verdict; claimed userIds are never authorized client-side.

## 7. Video room join

`POST /api/workspace/meetings/[id]/join` → load room → `canAccessRoom(userId, room, grants)` (status/expiry/host/level/invitee) → issue provider join info (Jitsi embed URL with display name, or Daily meeting token) → audit denial on failure. Room slugs are `ec-{slug}-{rand}`; expiry enforced both at access time and by the cron worker.

## 8. Data validation

Zod schemas in `src/lib/validations.ts` are shared by API routes (`parseBody`) and mirrored client-side; notable rules: username `^[a-z0-9][a-z0-9_.-]*[a-z0-9]$` 3–30, application time-gate ≥3000ms + empty honeypot, passwords ≥10 chars with letter+number.

## 9. Error & status conventions

- API errors: `{ error, code }` with 401/403/404/409/422/429/500/502; `AuthorizationError` → 401/403; ZodError → 422 with first issue path.
- UI states: every data surface implements loading (skeletons), empty (`EmptyState`), error (`ErrorNote`), and permission-denied variants.
