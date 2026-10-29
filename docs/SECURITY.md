# Security Documentation

Aligned to OWASP Top 10:2025 with OWASP ASVS 5.0 L1 as the verification reference.

## 1. Identity & session

- Passwords: scrypt (N=16384, r=8, p=1), per-user salt, constant-time verification. No custom crypto beyond the standard library.
- Sessions: HS256 JWT in an `httpOnly`, `SameSite=Lax`, `Secure` (in production) cookie; 8h expiry. No tokens in `localStorage`.
- Every request re-loads the user record: suspension/deactivation takes effect immediately; role snapshots in the token are never used for authorization.
- Login brute force: 8 attempts / 10 min per email + 20 / 10 min per IP (sliding window), audited as `auth.login_failed`.
- Enumeration defenses: login, forgot-password and invite-validation responses do not reveal account existence beyond necessity.

## 2. Authorization model (primary control)

- Deny by default. Every route handler calls `requireAuth()`/`requirePermission()` before any data access.
- Grants are recomputed from the DB (5s memo) — revoked permissions take effect within seconds and instantly after admin mutations.
- Resource scopes (`event:{id}`) limit leads to their own resources.
- Privilege-escalation guards:
  - cannot assign `admin`/`super_admin` unless Super Admin;
  - cannot grant a permission you do not hold;
  - cannot suspend/demote the last active Super Admin;
  - cannot suspend yourself;
  - system Super Admin role permissions are irrevocable.
- The control panel UI is **not** a security boundary; all `/api/control/*` routes enforce server-side.

## 3. Input handling & injection

- All request bodies validated with shared Zod schemas; failures return 422 with no stack traces.
- Prisma parameterized queries everywhere — no string-built SQL. The single raw query is `SELECT 1` (health).
- React escapes output by default; no `dangerouslySetInnerHTML` in the codebase.
- File uploads: this release stores **URL references only** (no binary upload endpoint), eliminating upload-based RCE/XSS vectors; a production storage integration must enforce type/size checks and storage policies (see DECISIONS D6).

## 4. Anti-abuse

| Vector | Control |
|---|---|
| Application spam | honeypot field + ≥3s time-gate + 3/30min per IP + duplicate email merge |
| Event registration abuse | 10/10min per IP + identity-bound duplicate check |
| Email bombing | outbox idempotency keys + per-recipient unique rows + opt-in preferences |
| Invite abuse | single-use hashed tokens, resend rotation, `security.invite_abuse_suspected` audit |
| Message flooding | 4000-char cap, membership validation, moderation queue |

## 5. Secrets management

Frontend-visible values are limited to public site config. Server-only: `SESSION_SECRET`, `INTERNAL_SERVICE_TOKEN`, `CRON_SECRET`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `DAILY_API_KEY`, `DATABASE_URL`. `.env.local` is git-ignored; `.env.example` documents placeholders only. Any bundled variable must be treated as public.

### Exposure runbook (summary)
1. Revoke/rotate the credential at the provider.
2. Audit logs for misuse (`audit_logs`, provider dashboards).
3. Update the secret store; redeploy affected components.
4. Verify the old credential is dead (e.g. a rejected call with the old key).
5. Add a regression test / monitoring rule for the leak vector.

## 6. Transport & headers

Production must serve HTTPS (HSTS recommended at the edge) — required for the `Secure` cookie attribute. Recommended edge headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (except the Jitsi iframe route if framed externally), `Referrer-Policy: strict-origin-when-cross-origin`, CSP with `frame-src https://meet.jit.si` when the video embed is used.

## 7. Structured security events

`auth.login_failed` · `auth.login_succeeded` · `auth.invite_accepted` · `membership.application_submitted` · `membership.application_approved|rejected` · `access.authorization_denied` · `admin.role_changed` · `admin.permission_granted|revoked` · `admin.member_updated` · `admin.settings_changed` · `announcement.published` · `announcement.email_queued` · `email.delivery_failed` · `video.room_created` · `video.room_access_denied` · `moderation.report_filed|resolved` · `security.webhook_signature_invalid` · `security.invite_abuse_suspected`.

**Never logged:** passwords, session tokens, invite/reset raw tokens, provider API keys, private message contents. `writeAudit` sanitizes keys matching `/password|token|secret|apikey|api_key|authorization/i` to `[redacted]`.

## 8. Threat register & controls

| Threat | Control | Verification |
|---|---|---|
| Privilege escalation via API | deny-by-default + escalation guards | unit tests (`tests/rbac.test.ts`), route checks |
| Unauthorized admin access | permission gates on every control route | curl smoke tests; `401/403` assertions |
| Private-message exposure | membership check on HTTP + socket paths | socket deny test; route check |
| Applicant-data exposure | reviewers-only projection; notes private | public API response audit |
| Invitation abuse | hashed single-use tokens, rotation, expiry | accept-invite flow tests |
| Secret leakage | server-only env, redaction, runbook | `.env.example` review |
| Email abuse | idempotent outbox + opt-outs + rate limits | outbox tests |
| Unsafe migrations | expand→migrate→contract policy; backups first | DEVOPS.md |
| Supply-chain | lockfile installs; pinned CI actions; `bun pm audit`/Dependabot equivalent | CI pipeline |
| XSS | React escaping; no raw HTML injection | code review |
| CSRF | `SameSite=Lax` cookies + JSON-only APIs (no form-encoded state changes) | design note |

## 9. Incident runbooks

Detailed procedures in `docs/INCIDENT_RESPONSE.md` (leaked secrets, compromised admin, data exposure, failed deployment, DB outage, email incident).

## 10. Known limitations (honest disclosure)

- Rate limiting is in-memory — per-instance only; horizontal scale needs a shared store.
- MFA is **not implemented** (no managed auth provider in this target); the admin panel relies on strong passwords + rate limiting. Wire Supabase Auth/TOTP when migrating.
- Resend webhook signature verification follows the svix scheme implemented from provider documentation; verify against the current official spec before production enablement.
- Jitsi free embed has no server-side room lifecycle; use Daily (or self-hosted Jitsi) for controlled rooms.
