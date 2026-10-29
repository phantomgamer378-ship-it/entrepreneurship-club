# INCIDENT_RESPONSE.md

Principles: preserve evidence → contain access → recover safely → verify controls → add regression tests. Never log or paste secrets into tickets; reference secret IDs instead.

Severity ladder: **S1** data exposure/compromised admin/production outage · **S2** auth or email subsystem degraded · **S3** single-feature defects, spam waves.

---

## IR-1 · Leaked secret (API key, session secret, token)

1. **Contain** — revoke/rotate at the provider immediately (Resend key, Daily key). If `SESSION_SECRET` leaked, rotate it: all sessions invalidate (users re-login).
2. **Assess** — search `audit_logs` and provider dashboards for anomalous usage since the exposure date (unknown senders, unexpected sends, failed-then-successful patterns).
3. **Eradicate** — find the leak vector (git history, CI logs, chat paste). Remove it; purge the secret from repository history only if the repo is public (use git filter-repo; rotation already neutralizes it).
4. **Recover** — update the secret store, redeploy affected components, verify the old credential returns `401/403`.
5. **Learn** — add a secret-scanning rule / CI check that would have caught it; record in DECISIONS.md if architecture changed.

## IR-2 · Compromised admin account

1. **Contain** — `PATCH /api/control/members {action:'suspend'}` the account (guard allows suspending any admin except the last Super Admin; if the victim IS the last Super Admin, suspend via direct DB access and immediately restore a second admin from a verified channel).
2. **Assess** — query `audit_logs` for `admin.*`, `announcement.published`, `email` events by the actor; identify the blast radius (roles granted? data read? emails sent?).
3. **Eradicate** — revoke roles/permissions granted by the attacker (`admin.role_changed` events list them); invalidate all sessions (rotate `SESSION_SECRET`); force password reset for affected users.
4. **Recover** — restore any tampered content from audit metadata; re-queue/cancel impacted email jobs.
5. **Learn** — enforce MFA when managed auth is adopted; tighten role-review cadence; regression-test the specific escalation attempted.

## IR-3 · Suspected private-data exposure (applications/messages)

1. **Contain** — identify the leak path. If an API surface is over-exposing, deploy a hotfix removing the field/route; if an admin account is the vector, see IR-2.
2. **Assess** — determine exactly what leaked (fields, recipients, duration) from access logs/audit events; classify sensitivity (PII in applications, private messages).
3. **Notify** — follow institutional policy (faculty advisor + university DPO) within the mandated window; document what was exposed and the mitigation.
4. **Recover** — invalidate exposed invitations/tokens (rotate), soft-delete abusive messages, re-check every public projection with the RLS-equivalent test suite.
5. **Learn** — add a regression test asserting the leaked field is absent from unauthorized responses.

## IR-4 · Failed deployment

1. **Contain** — stop the deploy pipeline; do not "fix forward" blindly on a broken schema state.
2. **Assess** — failed step (build, migrate, deploy, smoke)? If migrations partially applied, consult `prisma migrate status`.
3. **Recover** — redeploy the last known-good artifact; resolve migration state forward-only (never hand-edit production tables without a backup).
4. **Verify** — `/api/health`, login smoke, permission-denied probe, email queue depth.
5. **Learn** — add the missing pre-deploy check to CI.

## IR-5 · Database outage / corruption

1. **Contain** — switch status page/notice; stop cron workers to avoid half-written jobs.
2. **Assess** — file-level corruption? disk full? provider incident?
3. **Recover** — restore the latest verified backup per BACKUP_RECOVERY.md (RPO/RTO below), replay nothing ad-hoc; the outbox pattern means queued emails resume automatically.
4. **Verify** — row counts vs last audit snapshot, restore-test checklist, `/api/health`.
5. **Learn** — tighten RPO/RTO or backup frequency if the gap hurt.

## IR-6 · Email delivery incident

1. **Detect** — Email Center: sustained `failed`/`dead` growth or webhook `bounced` spike; provider status page.
2. **Contain** — pause bulk announcement sends (admin action: don't trigger fanout); if the provider key is the problem, rotate it.
3. **Assess** — classify: auth failure (key), reputation (domain), content (spam trap), rate limit (429 backoff should absorb).
4. **Recover** — `retryEmail` for recoverable jobs; dead jobs need manual review + re-queue; communicate to affected announcement audiences in-app if email is down.
5. **Learn** — adjust backoff/maxAttempts or provider configuration; add alerting threshold.

---

### Evidence checklist (all incidents)
Export: relevant `audit_logs` rows (JSON), email job + delivery logs, provider dashboard screenshots, timeline of admin actions taken. Store with the incident report; 12-month retention.

### Recovery targets (defaults — adjust to club needs)
- **RPO**: 24h (daily verified backup) — tighten to 1h if adoption grows.
- **RTO**: 4h for full restore; 30min for credential/session incidents (rotation path).

### Post-incident review template
What happened / when detected / blast radius / timeline / root cause / what worked / what didn't / action items with owners and dates / tests added.
