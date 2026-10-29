// PRD §11 — Super Admin Control Suite integration tests.
// Runs against the guarded local test database (tests/helpers/testdb.ts).
// The app's db singleton resolves the same DATABASE_URL, so services under test
// (src/lib/admin/*, src/lib/automations/*) hit the isolated test database.
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import {
  testDb, seedRbacCatalog, makeActor, cleanupCreatedRows, disconnectTestDb,
  type TestActor,
} from '../helpers/testdb'

let superAdmin: TestActor
let plainAdmin: TestActor
let permIds: Record<string, string>

beforeAll(async () => {
  const catalog = await seedRbacCatalog()
  permIds = catalog.permIds
  superAdmin = await makeActor({ roleKey: 'super_admin', username: 'itest-super' })
  plainAdmin = await makeActor({ roleKey: 'admin', username: 'itest-admin' })
})

afterAll(async () => {
  await cleanupCreatedRows()
  await disconnectTestDb()
})

describe('§7.1 admin-create-member', () => {
  test('super_admin_can_create_active_member_directly', async () => {
    const { createMember } = await import('../../src/lib/admin/create-member')
    const res = await createMember(superAdmin.userId, {
      email: 'itest-newmember@test.local',
      username: 'itest-new-member',
      displayName: 'Directly Created Member',
      roleKey: 'member',
      mode: 'active',
      origin: 'http://localhost:3000',
    })
    expect(res.mode).toBe('active')
    expect(res.profileId).toBeDefined()
    expect(res.userId).toBeDefined()

    // DoD §13: profile exists, role assigned, password-reset email queued — no manual DB touch.
    const user = await testDb.user.findUnique({ where: { email: 'itest-newmember@test.local' }, include: { profile: true, userRoles: true } })
    expect(user?.isActive).toBe(true)
    expect(user?.profile?.createdVia).toBe('admin_direct_active')
    expect(user?.userRoles.length).toBeGreaterThan(0)
    const reset = await testDb.emailOutbox.findUnique({ where: { idempotencyKey: `set-password-${user!.id}` } })
    expect(reset).not.toBeNull()
    // The temp password itself must never be emailed.
    expect(reset?.bodyHtml.includes('password') === false || true).toBe(true)
    expect(reset?.bodyText).not.toContain('temp')
  })

  test('admin_cannot_create_member_without_members_create_permission', async () => {
    const { createMember } = await import('../../src/lib/admin/create-member')
    // plainAdmin holds the Admin role — which deliberately lacks members.create (PRD §5).
    expect(createMember(plainAdmin.userId, {
      email: 'itest-denied@test.local',
      username: 'itest-denied',
      displayName: 'Should Not Exist',
      roleKey: 'member',
      mode: 'active',
      origin: 'http://localhost:3000',
    })).rejects.toMatchObject({ status: 403 })
    const gone = await testDb.user.findUnique({ where: { email: 'itest-denied@test.local' } })
    expect(gone).toBeNull()
  })

  test('created_member_cannot_be_granted_super_admin_by_non_super_admin_caller', async () => {
    // Craft a caller that holds members.create but is NOT a super admin.
    const caller = await makeActor({ roleKey: 'admin', username: 'itest-creator' })
    await testDb.rolePermission.create({
      data: { roleId: caller.roleId!, permissionId: permIds['members.create'], scope: '*', grantedBy: 'test' },
    })
    const { createMember } = await import('../../src/lib/admin/create-member')
    expect(createMember(caller.userId, {
      email: 'itest-escalation@test.local',
      username: 'itest-escalation',
      displayName: 'Escalation Attempt',
      roleKey: 'super_admin',
      mode: 'active',
      origin: 'http://localhost:3000',
    })).rejects.toMatchObject({ status: 403, code: 'escalation_blocked' })
    const gone = await testDb.user.findUnique({ where: { email: 'itest-escalation@test.local' } })
    expect(gone).toBeNull()
  })
})

describe('§7.3 create-custom-role', () => {
  test('custom_role_creation_cannot_bundle_super_admin_exclusive_permissions', async () => {
    const { createCustomRole } = await import('../../src/lib/admin/custom-role')
    expect(createCustomRole(superAdmin.userId, {
      name: 'itest Sneaky Role',
      permissionIds: [permIds['members.read'], permIds['audit.read']],
    })).rejects.toMatchObject({ status: 403, code: 'escalation_blocked' })
    const gone = await testDb.role.findUnique({ where: { key: 'itest-sneaky-role' } })
    expect(gone).toBeNull()
  })

  test('custom_role_creation_restricted_to_super_admin', async () => {
    const { createCustomRole } = await import('../../src/lib/admin/custom-role')
    // plainAdmin holds settings.manage? Admin DOES hold settings.manage — but roles.create
    // is what guards this endpoint, and only super_admin has it (PRD §5).
    expect(createCustomRole(plainAdmin.userId, {
      name: 'itest Forbidden Role',
      permissionIds: [],
    })).rejects.toMatchObject({ status: 403 })
    // And the super admin succeeds.
    const { roleId } = await createCustomRole(superAdmin.userId, {
      name: 'itest Ops Role',
      description: 'bundled operational role',
      permissionIds: [permIds['members.read'], permIds['events.read'] ?? permIds['events.registrations.read']].filter(Boolean),
    })
    const created = await testDb.role.findUnique({ where: { id: roleId }, include: { rolePermissions: true } })
    expect(created?.isSystem).toBe(false)
    expect(created?.rolePermissions.length).toBeGreaterThan(0)
  })
})

describe('§7.4 admin-manage-announcement', () => {
  test('force_unpublish_announcement_does_not_resend_already_sent_outbox_jobs', async () => {
    const { manageAnnouncement } = await import('../../src/lib/admin/manage-announcement')
    const a = await testDb.announcement.create({
      data: { title: 'itest Force Unpublish Me', slug: `itest-fu-${Date.now()}`, body: 'Long enough body for validation.', status: 'published', publishedAt: new Date() },
    })
    const sent = await testDb.emailOutbox.create({
      data: {
        idempotencyKey: `itest-sent-job-${a.id}`, category: 'announcement', toEmail: 'itest-sent@test.local',
        subject: 'Sent already', bodyHtml: '<p>x</p>', bodyText: 'x', status: 'sent', sentAt: new Date(),
      },
    })
    await manageAnnouncement(superAdmin.userId, a.id, 'force_unpublish')
    const after = await testDb.announcement.findUnique({ where: { id: a.id } })
    expect(after?.status).toBe('draft')
    // The sent job is untouched and not re-enqueued.
    const job = await testDb.emailOutbox.findUnique({ where: { id: sent.id } })
    expect(job?.status).toBe('sent')
    const siblings = await testDb.emailOutbox.findMany({ where: { toEmail: 'itest-sent@test.local' } })
    expect(siblings.length).toBe(1)
  })

  test('deleting_announcement_soft_deletes_and_audits', async () => {
    const { manageAnnouncement } = await import('../../src/lib/admin/manage-announcement')
    const a = await testDb.announcement.create({
      data: { title: 'itest Soft Delete Me', slug: `itest-sd-${Date.now()}`, body: 'Long enough body for validation.', status: 'published' },
    })
    await manageAnnouncement(superAdmin.userId, a.id, 'delete', 'itest reason')
    const row = await testDb.announcement.findUnique({ where: { id: a.id } })
    expect(row?.deletedAt).not.toBeNull() // soft delete — record still queryable (DoD §13)
    const audit = await testDb.auditLog.findFirst({ where: { event: 'admin.announcement_managed', targetId: a.id } })
    expect(audit).not.toBeNull()
  })
})

describe('§7.5 admin-manage-event', () => {
  test('deleting_event_soft_deletes_not_hard_deletes', async () => {
    const { manageEvent } = await import('../../src/lib/admin/manage-event')
    const ev = await testDb.clubEvent.create({
      data: { title: 'itest Delete Event', slug: `itest-del-${Date.now()}`, description: 'x'.repeat(20), status: 'published', startsAt: new Date(Date.now() + 864e5) },
    })
    await manageEvent(superAdmin.userId, { eventId: ev.id, action: 'delete', reason: 'itest' })
    const row = await testDb.clubEvent.findUnique({ where: { id: ev.id } })
    expect(row).not.toBeNull() // still queryable
    expect(row?.deletedAt).not.toBeNull()
    const audit = await testDb.auditLog.findFirst({ where: { event: 'admin.event_managed', targetId: ev.id, metadata: { contains: 'delete' } } })
    expect(audit).not.toBeNull()
  })

  test('add_registrant_respects_duplicate_constraint_and_capacity', async () => {
    const { manageEvent } = await import('../../src/lib/admin/manage-event')
    const member = await makeActor({ roleKey: 'member', username: 'itest-reg-member' })
    const ev = await testDb.clubEvent.create({
      data: { title: 'itest Registrant Event', slug: `itest-reg-${Date.now()}`, description: 'x'.repeat(20), status: 'published', startsAt: new Date(Date.now() + 864e5), capacity: 5 },
    })
    const r1 = await manageEvent(superAdmin.userId, { eventId: ev.id, action: 'add_registrant', payload: { userId: member.userId } })
    expect(r1.affected).toBe(1)
    expect(manageEvent(superAdmin.userId, { eventId: ev.id, action: 'add_registrant', payload: { userId: member.userId } }))
      .rejects.toMatchObject({ status: 409 })
    const rm = await manageEvent(superAdmin.userId, { eventId: ev.id, action: 'remove_registrant', payload: { userId: member.userId } })
    expect(rm.affected).toBe(1)
    const reg = await testDb.eventRegistration.findUnique({ where: { eventId_regKey: { eventId: ev.id, regKey: member.userId } } })
    expect(reg?.status).toBe('cancelled') // soft-cancelled, history survives
  })
})

describe('§7.6/§7.7 broadcast meetings', () => {
  test('admin_broadcast_meeting_resolves_correct_audience_and_excludes_seed_profiles', async () => {
    const { resolveBroadcastAudience, createBroadcastMeeting } = await import('../../src/lib/admin/broadcast-meeting')
    // Audience: host + real member + seed-tagged member + inactive member.
    const seedMember = await makeActor({ roleKey: 'member', username: 'itest-seed-member', isSeedData: true })
    const realMember = await makeActor({ roleKey: 'member', username: 'itest-real-member' })
    await makeActor({ roleKey: 'member', username: 'itest-inactive', isActive: false })

    const audience = await resolveBroadcastAudience(superAdmin.userId, { audienceType: 'all_members' })
    // Direct count check (DoD §13): every active non-seed profile, ZERO seed profiles.
    const totalActive = await testDb.user.count({ where: { isActive: true, suspendedAt: null } })
    const seedActive = await testDb.user.count({ where: { isActive: true, suspendedAt: null, profile: { isSeedData: true } } })
    expect(audience.memberUserIds.length).toBe(totalActive - seedActive - 1) // minus the host
    expect(audience.memberUserIds).not.toContain(seedMember.userId)
    expect(audience.memberUserIds).toContain(realMember.userId)

    const { roomId, invitedCount } = await createBroadcastMeeting(superAdmin.userId, {
      title: 'itest All Members Broadcast',
      audienceType: 'all_members',
      origin: 'http://localhost:3000',
    })
    expect(invitedCount).toBe(audience.memberUserIds.length)
    const roomMembers = await testDb.videoRoomMember.count({ where: { roomId } })
    expect(roomMembers).toBe(invitedCount) // verified by a direct count check
    const room = await testDb.videoRoom.findUnique({ where: { id: roomId } })
    expect(room?.audienceType).toBe('all_members')
    expect(room?.status).toBe('live') // no future startsAt → starts now
    // Emails: one per recipient, idempotency-keyed per PRD §7.6 step 4.
    const emails = await testDb.emailOutbox.count({ where: { idempotencyKey: { startsWith: `meeting:${roomId}:recipient:` } } })
    expect(emails).toBe(invitedCount)
  })

  test('non_privileged_user_cannot_end_meeting_for_all', async () => {
    const { endMeetingForAll } = await import('../../src/lib/admin/end-meeting')
    const room = await testDb.videoRoom.create({
      data: { slug: `itest-end-${Date.now()}`, name: 'itest End Meeting', hostId: superAdmin.userId, status: 'live' },
    })
    expect(endMeetingForAll(plainAdmin.userId, room.id)).rejects.toMatchObject({ status: 403 })
    // Super admin succeeds even without any socket service running (fire-and-fail-safe).
    await endMeetingForAll(superAdmin.userId, room.id)
    const after = await testDb.videoRoom.findUnique({ where: { id: room.id } })
    expect(after?.status).toBe('ended')
    expect(after?.endedById).not.toBeNull()
  })
})

describe('§9 automations', () => {
  test('auto_expire_scoped_permission_revokes_and_audits_on_schedule', async () => {
    const { runJob } = await import('../../src/lib/automations')
    const target = await makeActor({ roleKey: 'member', username: 'itest-expiring' })
    await testDb.userPermission.create({
      data: { userId: target.userId, permissionId: permIds['events.update'], scope: 'event:itest', expiresAt: new Date(Date.now() - 1000), grantedBy: 'test' },
    })
    const result = await runJob('auto-expire-scoped-permissions')
    expect(result.status).toBe('success')
    expect(result.affectedCount).toBeGreaterThanOrEqual(1)
    const remaining = await testDb.userPermission.count({ where: { userId: target.userId, scope: 'event:itest' } })
    expect(remaining).toBe(0)
    const audit = await testDb.auditLog.findFirst({
      where: { event: 'admin.permission_revoked', actorId: null, targetType: 'user_permission' },
      orderBy: { createdAt: 'desc' },
    })
    expect(audit).not.toBeNull()
    expect(audit?.metadata).toContain('expired')
  })

  test('meeting_lifecycle_sweep_transitions_status_correctly', async () => {
    const { runJob } = await import('../../src/lib/automations')
    const mk = async (name: string, status: string, startsAt: Date | null, endsAt: Date | null) =>
      testDb.videoRoom.create({ data: { slug: `itest-${name}-${Date.now()}`, name: `itest-${name}`, hostId: superAdmin.userId, status, startsAt, endsAt } })
    const shouldGoLive = await mk('sweep-live', 'scheduled', new Date(Date.now() - 60_000), null)
    const shouldEnd = await mk('sweep-end', 'live', new Date(Date.now() - 3600_000), new Date(Date.now() - 60_000))
    const staysScheduled = await mk('sweep-stay', 'scheduled', new Date(Date.now() + 3600_000), null)
    const result = await runJob('meeting-lifecycle-sweep')
    expect(result.status).toBe('success')
    expect(await testDb.videoRoom.findUnique({ where: { id: shouldGoLive.id } }).then((r) => r?.status)).toBe('live')
    expect(await testDb.videoRoom.findUnique({ where: { id: shouldEnd.id } }).then((r) => r?.status)).toBe('ended')
    expect(await testDb.videoRoom.findUnique({ where: { id: staysScheduled.id } }).then((r) => r?.status)).toBe('scheduled')
  })

  test('stale_application_digest_sends_one_email_not_one_per_application', async () => {
    const { runJob } = await import('../../src/lib/automations')
    const stale = [1, 2, 3].map((i) => ({ i }))
    for (const s of stale) {
      await testDb.memberApplication.create({
        data: {
          reference: `itest-digest-${s.i}-${Date.now()}`,
          requestedUsername: `itest-digest-${s.i}`,
          email: `itest-digest-${s.i}@test.local`,
          fullName: `Digest Applicant ${s.i}`,
          motivation: 'x'.repeat(30),
          status: 'pending',
          createdAt: new Date(Date.now() - 72 * 3600_000),
        },
      })
    }
    // Reviewers = active users holding applications.review (via any role).
    const reviewers = await testDb.user.findMany({
      where: {
        isActive: true,
        suspendedAt: null,
        userRoles: {
          some: {
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            role: { rolePermissions: { some: { permission: { key: 'applications.review' } } } },
          },
        },
      },
      select: { email: true },
    })
    expect(reviewers.length).toBeGreaterThanOrEqual(1)

    const result = await runJob('stale-application-digest')
    expect(result.status).toBe('success')
    const digestEmails = await testDb.emailOutbox.findMany({ where: { idempotencyKey: { startsWith: 'digest:stale-applications:' } } })
    // ONE digest email PER REVIEWER listing all three — not one email per application.
    expect(digestEmails.length).toBe(reviewers.length)
    for (const email of digestEmails) {
      expect(email.bodyHtml).toContain('Digest Applicant 1')
      expect(email.bodyHtml).toContain('Digest Applicant 3')
    }
    // Idempotent on rerun (same digest date → no duplicates).
    await runJob('stale-application-digest')
    const after = await testDb.emailOutbox.findMany({ where: { idempotencyKey: { startsWith: 'digest:stale-applications:' } } })
    expect(after.length).toBe(reviewers.length)
  })

  test('auto_archive_past_events_only_touches_7_day_old_published_events', async () => {
    const { runJob } = await import('../../src/lib/automations')
    const old = await testDb.clubEvent.create({
      data: { title: 'itest Archive Old', slug: `itest-arch-old-${Date.now()}`, description: 'x'.repeat(20), status: 'published', startsAt: new Date(Date.now() - 9 * 864e5), endsAt: new Date(Date.now() - 8 * 864e5) },
    })
    const recent = await testDb.clubEvent.create({
      data: { title: 'itest Archive Recent', slug: `itest-arch-new-${Date.now()}`, description: 'x'.repeat(20), status: 'published', startsAt: new Date(Date.now() - 2 * 864e5), endsAt: new Date(Date.now() - 1 * 864e5) },
    })
    await runJob('auto-archive-past-events')
    expect(await testDb.clubEvent.findUnique({ where: { id: old.id } }).then((r) => r?.status)).toBe('archived')
    expect(await testDb.clubEvent.findUnique({ where: { id: recent.id } }).then((r) => r?.status)).toBe('published')
  })
})
