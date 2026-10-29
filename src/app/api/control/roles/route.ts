// Role & permission editor (§7.5): list roles+permissions, create custom roles,
// grant/revoke role permissions and per-user permissions. All changes audited.
import { db } from '@/lib/db'
import { ok, fail, handleError, parseBody, auth } from '@/lib/api'
import { permissionGrantSchema, permissionRevokeSchema, createCustomRoleSchema } from '@/lib/validations'
import { can, PERMISSIONS, revalidateUserGrants, getUserGrants } from '@/lib/rbac/authorize'
import { createCustomRole } from '@/lib/admin/custom-role'
import { writeAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { userId } = await auth()
    if (!(await can(userId, PERMISSIONS.membersRead))) return fail(403, 'Not authorized.', 'forbidden')
    const [roles, permissions] = await Promise.all([
      db.role.findMany({
        orderBy: { key: 'asc' },
        include: {
          rolePermissions: {
            select: { id: true, scope: true, grantedBy: true, grantedAt: true, permission: { select: { key: true } } },
          },
          _count: { select: { userRoles: true } },
        },
      }),
      db.permission.findMany({ orderBy: { key: 'asc' } }),
    ])
    return ok({ roles, permissions })
  } catch (err) {
    return handleError(err)
  }
}

/** PRD §7.3 — create-custom-role: Super-Admin-only; may bundle any permission except
 *  the Super-Admin-exclusive set (server-enforced, mirrored by disabled checkboxes). */
export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    const input = await parseBody(req, createCustomRoleSchema)
    const { roleId } = await createCustomRole(userId, input)
    return ok({ ok: true, role_id: roleId }, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}

/** Grant a permission to a role or user (with scope + optional expiry). */
export async function PUT(req: Request) {
  try {
    const { userId: actor } = await auth()
    if (!(await can(actor, PERMISSIONS.membersPermissionsGrant))) return fail(403, 'Not authorized to grant permissions.', 'forbidden')
    const input = await parseBody(req, permissionGrantSchema)
    if (!input.roleId && !input.userId) return fail(422, 'roleId or userId required', 'validation_error')

    // Privilege-escalation guard: an actor can only grant permissions they themselves hold.
    const actorGrants = await getUserGrants(actor)
    const perm = await db.permission.findUnique({ where: { key: input.permissionId } })
    if (!perm) return fail(404, 'Permission not found', 'not_found')
    if (!actorGrants.some((g) => g.key === perm.key)) {
      return fail(403, 'You cannot grant a permission you do not hold yourself.', 'escalation_blocked')
    }

    if (input.roleId) {
      const role = await db.role.findUnique({ where: { id: input.roleId } })
      if (!role) return fail(404, 'Role not found', 'not_found')
      await db.rolePermission.upsert({
        where: { roleId_permissionId_scope: { roleId: role.id, permissionId: perm.id, scope: input.scope || '*' } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id, scope: input.scope || '*', grantedBy: actor },
      })
      await writeAudit({ event: 'admin.permission_granted', actorId: actor, targetType: 'role', targetId: role.id, metadata: { permission: perm.key, scope: input.scope } })
    } else if (input.userId) {
      await db.userPermission.upsert({
        where: { userId_permissionId_scope: { userId: input.userId, permissionId: perm.id, scope: input.scope || '*' } },
        update: {},
        create: { userId: input.userId, permissionId: perm.id, scope: input.scope || '*', grantedBy: actor },
      })
      revalidateUserGrants(input.userId)
      await writeAudit({ event: 'admin.permission_granted', actorId: actor, targetType: 'user', targetId: input.userId, metadata: { permission: perm.key, scope: input.scope } })
    }
    return ok({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}

/** Revoke a permission from a role or user. */
export async function DELETE(req: Request) {
  try {
    const { userId: actor } = await auth()
    if (!(await can(actor, PERMISSIONS.membersPermissionsGrant))) return fail(403, 'Not authorized.', 'forbidden')
    const input = await parseBody(req, permissionRevokeSchema)
    if (!input.roleId && !input.userId) return fail(422, 'roleId or userId required', 'validation_error')

    if (input.roleId) {
      const role = await db.role.findUnique({ where: { id: input.roleId }, include: { userRoles: { select: { user: { select: { id: true } } } } } })
      if (!role) return fail(404, 'Role not found', 'not_found')
      if (role.key === 'super_admin' && role.isSystem) {
        return fail(409, 'System Super Admin permissions cannot be revoked.', 'protected_role')
      }
      const perm = await db.permission.findUnique({ where: { key: input.permissionId } })
      if (!perm) return fail(404, 'Permission not found', 'not_found')
      const result = await db.rolePermission.deleteMany({
        where: { roleId: role.id, permissionId: perm.id, scope: input.scope || '*' },
      })
      for (const ur of role.userRoles) revalidateUserGrants(ur.user.id)
      await writeAudit({ event: 'admin.permission_revoked', actorId: actor, targetType: 'role', targetId: role.id, metadata: { permission: input.permissionId, scope: input.scope, removed: result.count } })
    } else if (input.userId) {
      const perm = await db.permission.findUnique({ where: { key: input.permissionId } })
      if (!perm) return fail(404, 'Permission not found', 'not_found')
      await db.userPermission.deleteMany({
        where: { userId: input.userId, permissionId: perm.id, scope: input.scope || '*' },
      })
      revalidateUserGrants(input.userId)
      await writeAudit({ event: 'admin.permission_revoked', actorId: actor, targetType: 'user', targetId: input.userId, metadata: { permission: input.permissionId, scope: input.scope } })
    }
    return ok({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
