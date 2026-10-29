# Database Documentation

Schema: `prisma/schema.prisma` · 24 tables · SQLite (dev/sandbox) with a documented PostgreSQL migration path.

## 1. Entity map

```
User 1─1 Profile                     ClubEvent 1─* EventRegistration
User 1─* UserRole ─* Role            User 1─* MemberApplication (as applicant)
Role *─* Permission via RolePermission
User 1─* UserPermission (scoped overrides)
MemberApplication 1─* ClubInvite
Announcement 1─* AnnouncementRecipient ─ EmailOutbox
EmailOutbox 1─* EmailDeliveryLog
User 1─1 EmailPreference
Conversation *─* User via ConversationMember; Conversation 1─* Message 1─* MessageReport
VideoRoom 1─* VideoRoomMember
User 1─* AuditLog · ClubSetting (kv) · PasswordResetToken · Notification
```

## 2. Table reference (key columns)

### Identity & access
| Table | Purpose | Key constraints |
|---|---|---|
| `User` | auth identity | `email` unique; `isActive` (invite activation); `suspendedAt` |
| `Profile` | public member profile | `username` unique (**case-insensitivity enforced at write sites** — lowercased before create; SQLite has no CI collation), `isPublic` approval flag |
| `Role` | role catalog | `key` unique; `isSystem` protects seeds |
| `Permission` | permission catalog | `key` unique |
| `RolePermission` | role→permission grant | unique(`roleId`,`permissionId`,`scope`); `scope` `*` or `type:{id}` |
| `UserRole` | role assignment | unique(`userId`,`roleId`,`scope`); `assignedBy`; `expiresAt` |
| `UserPermission` | per-user grants | unique(`userId`,`permissionId`,`scope`); `expiresAt` |
| `PasswordResetToken` | recovery | `tokenHash` unique (SHA-256), `usedAt`, `expiresAt` |

### Membership
| Table | Purpose | Key constraints |
|---|---|---|
| `MemberApplication` | public applications | `reference` unique (public ref code); `status` pending/approved/rejected; `reviewNotes` **private**; `applicantUserId` link on invite acceptance |
| `ClubInvite` | activation invitations | `tokenHash` unique; `status` pending/accepted/expired/revoked; `expiresAt`; `sentCount` |

### Events & announcements
| Table | Purpose | Key constraints |
|---|---|---|
| `ClubEvent` | events | `slug` unique; `status` draft/published/completed/cancelled/archived; `registrationOpen`; `registrationDeadline`; `capacity` |
| `EventRegistration` | registrations | unique(`eventId`,`regKey`) where `regKey` = userId or lowercased guest email → prevents duplicates for both members and guests; `status` confirmed/cancelled/attended/no_show |
| `Announcement` | announcements | `slug` unique; `status` draft/scheduled/published/archived; `audience` public/members/leads; `pinned` |
| `AnnouncementRecipient` | per-recipient email tracking | unique(`announcementId`,`email`) → duplicate-campaign protection |
| `EmailPreference` | opt-outs | `userId` PK; `announcementEmails`, `eventReminders` |

### Email & notifications
| Table | Purpose | Key constraints |
|---|---|---|
| `EmailOutbox` | queue | `idempotencyKey` unique; `status` queued/sending/sent/failed/dead; `attempts`/`maxAttempts`; `nextAttemptAt`; indexed(`status`,`nextAttemptAt`) |
| `EmailDeliveryLog` | provider events | indexed by `outboxId`; `event` accepted/delivered/bounced/complained/opened/send_attempt/send_failed |
| `Notification` | in-app alerts | indexed(`userId`,`readAt`) |

### Communication
| Table | Purpose | Key constraints |
|---|---|---|
| `Conversation` | direct/group | `type`; `lastMessageAt` |
| `ConversationMember` | membership | unique(`conversationId`,`userId`); `lastReadAt` → unread computation |
| `Message` | content | indexed(`conversationId`,`createdAt`); `isDeleted` soft delete; `reportCount` |
| `MessageReport` | moderation | `status` open/resolved/dismissed; `resolvedBy`/`resolvedAt` |

### Video
| Table | Purpose | Key constraints |
|---|---|---|
| `VideoRoom` | rooms | `slug` unique; `provider` jitsi/daily; `accessLevel` members/leads/invitees; `expiresAt` |
| `VideoRoomMember` | explicit invitees | unique(`roomId`,`userId`) |

### Governance
| Table | Purpose |
|---|---|
| `AuditLog` | `event` (namespaced), `actorId/actorEmail`, `targetType/targetId`, sanitized `metadata` JSON, `ip`; indexed(event, actorId, createdAt) |
| `ClubSetting` | key/value JSON store for site content |

## 3. Data-access rules (RLS-equivalent)

This deployment has no database-level RLS (SQLite); the equivalent guarantee is enforced in **one server-side layer** — every API route resolves the session and checks the central authorization module before touching Prisma. The mapping:

| Requirement (§10) | Enforcement point |
|---|---|
| Users update own permitted profile fields | `PATCH /api/workspace/profile` (whitelist of fields; username immutable) |
| Public read only approved profiles | queries filter `isPublic ∧ active ∧ !suspended` |
| Public announcements readable by all | `audience='public' ∧ status='published'` |
| Internal announcements require session+audience | grants-based audience check in `/api/public/announcements` |
| Applications visible to authorized reviewers only | `applications.read` permission gate; `reviewNotes` never in public projections |
| Messages only for participants | membership unique lookup before any read/write (HTTP **and** socket paths) |
| Users cannot modify another's registration | registration identity bound to session user or validated guest identity |
| Admin actions need permission + scope | `requirePermission` with resource scope |
| Storage uploads follow ownership rules | uploads limited to URL references in this release (no binary storage); documented limitation |
| Secrets never in frontend | only `VITE_*`-class public values exist; all provider keys server-only (env.ts) |

Migrating to PostgreSQL/Supabase later: translate each row above into a native RLS policy (e.g. `messages` policy: `EXISTS (SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = messages.conversation_id AND cm.user_id = auth.uid())`) — the route-level checks can then remain as defense-in-depth.

## 4. Username uniqueness (case-insensitive)

All write paths lowercase usernames before insert (`join` route zod transform, invite acceptance, profile PATCH does not touch username). The unique index on `Profile.username` then guarantees `Priya.Nair` and `priya.nair` cannot coexist. The public lookup route lowercases the `:username` param.

## 5. Migration & versioning

- Dev iteration: `bun run db:push` (schema-as-truth).
- Production discipline: switch to `prisma migrate` (`db:migrate`) with reviewed, committed SQL migrations under `prisma/migrations/`; expand→migrate→contract for breaking changes; never assume a frontend rollback reverts a migration.
- Postgres migration steps: change `datasource provider`, regenerate client, run generated SQL against an empty DB, replay seed without demo users.

## 6. Retention

Applications and rejected records are retained for governance; message soft-deletes preserve moderation evidence; audit logs are append-only. Define club-specific retention windows before production (see BACKUP_RECOVERY.md).

---

## Super Admin Control Suite additions (PRD phase, 2026-10-26)

Migration `prisma/migrations/20251026000001_super_admin_powers/migration.sql` (numbered, applied):

- `Profile.isSeedData` (bool, default false) — Section 25.2 seed tagging; excluded from every public query path and from broadcast audiences.
- `Profile.createdVia` (`application | admin_direct_invite | admin_direct_active`) and `Profile.archivedAt` — member provenance + soft archival.
- `ClubEvent.isSeedData`, `ClubEvent.deletedAt`; `Announcement.isSeedData`, `Announcement.deletedAt` — soft deletes keep records queryable for history/audit; all listing query paths (public and admin) filter `deletedAt IS NULL`.
- `ClubInvite.requestedUsername` — username reserved at admin-direct-invite time (PRD §7.1).
- `VideoRoom.audienceType` (`direct_invite | role | event | all_members`), `VideoRoom.audienceRef`, `VideoRoom.endedById` → `Profile`. Room lifecycle statuses are now `scheduled | live | ended` (managed by `meeting-lifecycle-sweep`); legacy `'active'` rows were migrated to `'live'` by the same migration.
- `AutomationRun` — per-run log for every scheduled job (jobName, startedAt, completedAt, status running|success|failed, affectedCount, notes).

New permissions (seeded): `members.create`, `members.delete`, `announcements.delete`, `events.delete`, `events.registrations.manage`, `video.create.broadcast`, `video.end_for_all`, `roles.create`, `automations.read`. Super Admin holds all; Admin holds only `announcements.delete`, `events.delete`, `events.registrations.manage`. `members.create`, `members.delete`, `roles.create`, `video.end_for_all` are Super-Admin-exclusive (also enforced for custom roles via `SUPER_ADMIN_EXCLUSIVE_PERMISSIONS`).
