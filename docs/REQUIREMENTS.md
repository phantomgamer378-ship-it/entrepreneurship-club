# Requirements — Entrepreneurship Club Platform

ALTA School of Technology, Ajeenkya DY Patil University, Pune.

## 1. Product vision

A modern, responsive, fast platform serving three distinct experiences:

1. **Public website** — discover the club, explore members and leadership, browse past events, read public announcements, register for events, apply for membership.
2. **Member workspace** — approved, authenticated members manage their profile, read authorized announcements, exchange messages, and join video meetings.
3. **Private administration panel** — administrators and faculty manage applications, members, teachers, roles, permissions, events, announcements, email automation, moderation and settings.

## 2. Core priorities (ordered)

1. Public website and content
2. Secure authentication and membership registration
3. Role-based admin panel
4. Event registration and management
5. Announcement and email automation
6. DevOps, testing, backups and security
7. Private messaging
8. Multi-participant video conferencing and screen sharing
9. Optional future machine-learning features (explicitly out of scope for v1)

## 3. Functional requirements

### Public site
| Area | Requirement | Status |
|---|---|---|
| Homepage `/` | Hero, mission/vision, impact stats, leadership preview, upcoming events, past highlights, public announcements, membership CTA, event registration entry, footer | ✅ |
| Team `/team` | Search, role filters, responsive grid, avatars, unique usernames, role labels, approved LinkedIn/GitHub, pagination | ✅ |
| Profile `/members/:username` | Avatar, username, display name, role, bio, links, achievements; username uniqueness case-insensitive | ✅ |
| Events `/events` | Upcoming/past categories, search, year filter, detail views, recap content, admin archiving; past events remain visible | ✅ |
| Announcements `/announcements` | Published public posts, detail view, categories, dates, pinned items, audience-aware visibility (public/members/leads) | ✅ |
| Join `/join` | Username, email, name, course/year, interest, motivation, optional links; client+server validation, duplicate handling, honeypot + time-gate anti-spam, rate limiting, application reference, pending status, reviewer notifications, controlled approval, secure invitation | ✅ |

### Authentication & workspace
- Supabase-style managed auth is **unavailable in this deployment target**; equivalent capability implemented locally (scrypt password hashing, httpOnly JWT sessions, invitation-based activation, single-use password reset) behind a documented provider boundary. See `docs/DECISIONS.md` D2.
- Routes: `/auth/login`, `/auth/accept-invite`, `/auth/forgot-password` (+ reset), `/workspace`, `/workspace/profile`.
- Member dashboard: welcome, status, profile summary, latest announcements, upcoming events, unread messages, meeting invitations, notifications.
- Profile settings expose only fields the user is authorized to change (username immutable).

### Admin panel
Routes: `/control/sign-in`, `/control`, `/control/applications`, `/control/members`, `/control/teachers`, `/control/roles`, `/control/events`, `/control/announcements`, `/control/emails`, `/control/moderation`, `/control/audit`, `/control/settings`.

- Application review: read, private notes, approve/reject with reviewer + timestamp, invitation issuance/inspection/resend.
- Member management: edit metadata, promote/demote via role assignment (with scopes), suspend/reactivate; role history preserved (no destructive deletes).
- Teacher management: faculty invitations (`faculty_advisor` role), reviewer notifications restricted to authorized accounts.
- Role & permission editor: view grants + grantor, create custom roles, grant/revoke scoped permissions, escalation guard (cannot grant what you do not hold), Super Admin-only administrative roles, last-Super-Admin protection.
- Overview: pending applications, active members, role assignments, upcoming events, registration counts, announcement status, email failures, open moderation reports.

### RBAC
DB-backed roles/permissions; deny by default; resource-scoped grants (`event:{id}`); central authorization module used by every API route; frontend permission labels are cosmetic only.

Initial roles: Visitor, Pending Member, Member, Club Lead, Club President, Faculty Advisor, Admin, Super Admin.

### Email automation
Outbox pattern with idempotency keys, bounded retries + backoff, delivery logs, webhook handling (signature-verified when configured), subscription preferences and opt-out, manual retry, ops failure alerts. Ten categories implemented.

### Event registration pipeline
Server-verified published/open status, deadline, capacity, duplicate prevention (unique constraint), queued confirmation email, live counts, attendance recording, archived recaps.

### Announcement pipeline
Draft → scheduled → published → archived; audience targeting; explicit confirmed bulk email fanout; per-recipient dedup; website publication decoupled from email delivery.

### Messaging & video
Direct/group conversations, persistent history, realtime fanout via socket.io, unread indicators, search, pagination, reporting + moderation queue. Video: provider adapter (Jitsi embed default; Daily config-gated), server-validated room access, expiring rooms, host controls, screen share inside provider surface.

## 4. Non-functional requirements

- **Security** — OWASP Top 10-aligned; deny-by-default authorization; secrets server-side only; structured security events; rate limiting; see `docs/SECURITY.md`.
- **Performance** — lazy-loaded route bundles, pagination, debounced search, `prefers-reduced-motion` support, skeleton loading states.
- **Accessibility** — semantic HTML, ARIA labels, keyboard navigation, skip link, focus-visible styles, 44px touch targets.
- **Observability** — structured audit logs, health endpoint, email queue metrics, provider status visibility in admin.
- **Backups & recovery** — see `docs/BACKUP_RECOVERY.md` (SQLite file-based pipeline for this deployment).
