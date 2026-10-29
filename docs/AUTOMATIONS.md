# AUTOMATIONS.md — Email & Business Automations

All automations follow the **outbox pattern**: the business record is persisted first, the email job is enqueued second, and delivery is asynchronous with bounded retries. A provider outage never loses data or blocks a user flow.

## 1. Email categories (§11)

| # | Category (`category`) | Trigger | Recipient | Idempotency key |
|---|---|---|---|---|
| 1 | `application_receipt` | membership application submitted | applicant | `app-receipt-{applicationId}` |
| 2 | `reviewer_notification` | application submitted | authorized reviewers (president/advisors/admins) | `app-review-notify-{applicationId}-{email}` |
| 3 | `application_decision` | approve/reject decision | applicant | `app-decision-{applicationId}` |
| 4 | `membership_invite` | approval, manual invite, resend | invitee | `invite-{inviteId}` / `invite-{inviteId}-{n}` |
| 5 | `welcome` | invite accepted | new member | `welcome-{userId}` |
| 6 | `event_registration` | successful registration | attendee | `event-reg-{registrationId}` |
| 7 | `event_reminder` | cron: event within 48h | confirmed attendees | `event-reminder-{eventId}-{email}` |
| 8 | `announcement` | confirmed bulk send | audience ∩ opt-ins | `announcement-{announcementId}-{email}` |
| 9 | `membership_notice` | password reset link | requester | `pwreset-{userId}-{tokenHash12}` |
| 10 | ops alert | delivery failures, incidents | maintainers (manual/config) | `ops-{scope}-{id}` |

## 2. Outbox state machine

```
queued ──claim──► sending ──accepted──► sent
   ▲                  │
   │                  └──rejected/error──► failed ──(backoff 1m,5m,30m,2h)──► retry as queued
   └────── manual retry (admin) ───────────────┘
failed ──attempts ≥ maxAttempts(5)──► dead (+ email.delivery_failed audit)
```

- Claiming is atomic (`updateMany` conditional on status) — two workers cannot double-send.
- Idempotency keys are unique at the DB level — enqueue is safe to repeat.
- Provider acceptance ≠ delivery: `email_delivery_logs` records webhooks (`delivered`, `bounced`, `complained`, `opened`); bounces mark the job `failed` with the webhook reason.

## 3. Delivery infrastructure

- **Provider interface** (`src/lib/email/provider.ts`): `ConsoleEmailProvider` (dev — logs + synthetic reference, clearly labeled) and `ResendEmailProvider` (active iff `RESEND_API_KEY`; sends with `Idempotency-Key` header; maps 429 to a retryable failure).
- **Webhook** `POST /api/webhooks/resend`: HMAC-SHA256 raw-body signature vs `RESEND_WEBHOOK_SECRET`; unverified webhooks are rejected in production posture and audited as unverified in dev.
- **Worker** `POST /api/cron/email-worker` (cron secret): outbox + scheduled announcements + reminders + room expiry. Run every 5 minutes.

## 4. Subscription preferences

`email_preferences` per user: `announcementEmails`, `eventReminders`. The announcement fanout and reminder automation skip opted-out users. Receipts, decisions, invitations and operational notices are transactional (not preference-gated). Preference management lives in the workspace profile area; `optedOutAt` records the timestamp.

## 5. Event registration & reminders

- Registration (public endpoint): server validates published/open/deadline/capacity/duplicate → persists → queues confirmation → admin counts update automatically (aggregate queries).
- Attendance: authorized staff mark `attended`/`no_show` from the control panel.
- Reminders: cron queues one idempotent reminder per confirmed attendee for events starting within 48h.

## 6. Announcement pipeline automations

- Scheduled announcements auto-publish in the cron worker when `scheduledFor ≤ now`.
- Email fanout is an explicit, **confirmed** admin action; recipients are deduplicated by unique `(announcement, email)`; recipient statuses sync from outbox results; re-sending after content updates creates jobs only for recipients missing a row (documented behavior: new/missed recipients only).
- Website publication is independent of email delivery — a provider failure never removes a published announcement.

## 7. Membership lifecycle automations

1. Application submitted → receipt + reviewer notifications.
2. Decision recorded → decision email; approval also ensures exactly one pending invitation.
3. Invitation accepted → account activated, role assigned, welcome email queued, application linked (`applicantUserId`).
4. Suspensions/role changes are audited; reactivation restores access instantly (session revalidation).

## 8. Operational failure alerts

`email.delivery_failed` audit events mark dead letters. Recommended: a daily cron digest email to maintainers listing `dead` jobs and `open` moderation reports (category `ops_alert` template already exists in `src/lib/email/templates.ts`).

## 9. Verification status (honest)

- Outbox processing, retries/backoff, dead-lettering, idempotency: **implemented + unit/smoke tested**.
- Resend delivery + webhook signature flow: **implemented; unverified end-to-end** (no API key in this environment) — see docs/STATUS_REPORT.md.
- Event reminders & scheduled publishing: **implemented + smoke tested** via cron endpoint.

---

## Super Admin Control Suite automations (PRD §9, 2026-10-26)

Runner: `POST /api/cron/automations` with `x-cron-secret` header; body `{ "job": "<name>" | "all" }`. Every run writes an `AutomationRun` row (running → success|failed with affected_count).

| Schedule | Job | Behavior |
|---|---|---|
| `0 2 * * *` | `auto-archive-past-events` | published events whose `endsAt < now − 7d` → `archived` |
| `*/15 * * * *` | `auto-expire-scoped-permissions` | delete expired `UserPermission` rows; audit `admin.permission_revoked` with `actorId = null` |
| `*/5 * * * *` | `meeting-lifecycle-sweep` | `scheduled → live` when `startsAt <= now`; `scheduled/live → ended` when `endsAt < now` |
| `0 9 * * *` | `stale-application-digest` | ONE digest email per reviewer per day listing all applications pending > 48h (idempotency key = digest date + reviewer) |

View history at `/control/automations` (permission `automations.read`).
