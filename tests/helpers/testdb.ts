// Integration test harness (Section 25.4 compliant).
// - The whole integration suite runs against a LOCAL disposable SQLite file
//   (file:./db/test-suite.db, reset by `bun run db:test:push` before every run).
// - assertTestDatabase() runs at import: if DATABASE_URL is not a recognized local
//   test database, the suite aborts before a single write.
import { PrismaClient } from '@prisma/client'
import { assertTestDatabase } from '../../src/lib/test-guard'

assertTestDatabase(process.env.DATABASE_URL)

export const testDb = new PrismaClient({ log: [] })

/** Seeds the RBAC catalog (permissions, system roles, grants) into the test DB. */
export async function seedRbacCatalog(): Promise<{ superAdminRoleId: string; adminRoleId: string; permIds: Record<string, string> }> {
  const { PERMISSIONS, SYSTEM_ROLES } = await import('../../src/lib/rbac/permissions')
  const permIds: Record<string, string> = {}
  for (const key of Object.values(PERMISSIONS)) {
    const perm = await testDb.permission.upsert({
      where: { key },
      update: {},
      create: { key, description: key, isSystem: true },
    })
    permIds[key] = perm.id
  }
  const ids: Record<string, string> = {}
  for (const role of SYSTEM_ROLES) {
    const r = await testDb.role.upsert({
      where: { key: role.key },
      update: {},
      create: { key: role.key, name: role.name, description: role.description, isSystem: true },
    })
    ids[role.key] = r.id
    for (const key of role.permissions) {
      await testDb.rolePermission.upsert({
        where: { roleId_permissionId_scope: { roleId: r.id, permissionId: permIds[key], scope: '*' } },
        update: {},
        create: { roleId: r.id, permissionId: permIds[key], scope: '*', grantedBy: 'test' },
      })
    }
  }
  return { superAdminRoleId: ids['super_admin'], adminRoleId: ids['admin'], permIds }
}

let counter = 0
export function uniqueEmail(prefix = 'itest'): string {
  counter += 1
  return `${prefix}-${Date.now()}-${counter}@test.local`
}

export type TestActor = { userId: string; roleId?: string; profileId?: string }

/** Creates an active user (+profile+role) for test scenarios. Rows are tagged for cleanup. */
export async function makeActor(opts: {
  email?: string
  username?: string
  displayName?: string
  roleId?: string
  roleKey?: string
  isSeedData?: boolean
  isActive?: boolean
}): Promise<TestActor> {
  const email = opts.email ?? uniqueEmail()
  let roleId = opts.roleId
  if (!roleId && opts.roleKey) {
    roleId = (await testDb.role.findUnique({ where: { key: opts.roleKey } }))?.id
  }
  const user = await testDb.user.create({
    data: {
      email,
      fullName: opts.displayName ?? 'Integration Test',
      passwordHash: null,
      isActive: opts.isActive ?? true,
      profile: {
        create: {
          username: opts.username ?? email.split('@')[0].replace(/[^a-z0-9-]/g, '-').slice(0, 30),
          displayName: opts.displayName ?? 'Integration Test',
          isSeedData: opts.isSeedData ?? false,
        },
      },
      ...(roleId ? { userRoles: { create: { roleId, scope: '*', assignedBy: 'test' } } } : {}),
    },
    include: { profile: true },
  })
  return { userId: user.id, roleId, profileId: user.profile.id }
}

/** Section 25.4 — the suite deletes every row it created. Called from afterAll. */
export async function cleanupCreatedRows(): Promise<void> {
  await testDb.user.deleteMany({ where: { email: { startsWith: 'itest-' } } })
  await testDb.videoRoom.deleteMany({ where: { name: { startsWith: 'itest-' } } })
  await testDb.announcement.deleteMany({ where: { title: { startsWith: 'itest-' } } })
  await testDb.clubEvent.deleteMany({ where: { title: { startsWith: 'itest-' } } })
  await testDb.memberApplication.deleteMany({ where: { email: { endsWith: '@test.local' } } })
  await testDb.automationRun.deleteMany({ where: { jobName: { in: ['auto-archive-past-events', 'auto-expire-scoped-permissions', 'meeting-lifecycle-sweep', 'stale-application-digest'] } } })
  await testDb.auditLog.deleteMany({ where: { event: { in: ['admin.permission_revoked', 'admin.member_created', 'admin.role_changed', 'admin.announcement_managed', 'admin.event_managed', 'video.room_created', 'video.room_ended_for_all', 'access.authorization_denied'] } } })
  await testDb.role.deleteMany({ where: { isSystem: false } })
  await testDb.rolePermission.deleteMany({ where: { grantedBy: 'test' } })
  await testDb.emailOutbox.deleteMany({ where: { toEmail: { endsWith: '@test.local' } } })
  await testDb.emailOutbox.deleteMany({ where: { idempotencyKey: { startsWith: 'digest:stale-applications:' } } })
}

export async function disconnectTestDb(): Promise<void> {
  await testDb.$disconnect()
}
