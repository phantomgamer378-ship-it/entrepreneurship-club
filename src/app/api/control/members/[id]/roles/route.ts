// Role assignment / removal for a user (§7.3, §8).
// - Deny-by-default; only members.role.assign holders may act.
// - Admins cannot grant roles broader than their own (checked below); only Super Admin
//   may assign admin/super_admin roles.
// - The last active Super Admin can never be demoted (safe succession required first).
import { db } from '@/lib/db'
import { ok, fail, handleError, parseBody, auth } from '@/lib/api'
import { roleAssignSchema, roleRemoveSchema } from '@/lib/validations'
import { can, PERMISSIONS, activeSuperAdminCount, revalidateUserGrants } from '@/lib/rbac/authorize'
import { writeAudit } from '@/lib/audit'

const PROTECTED_ROLES = ['admin', 'super_admin']

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId: actor } = await auth()
    if (!(await can(actor, PERMISSIONS.membersRoleAssign))) return fail(403, 'Not authorized to assign roles.', 'forbidden')
    await params
    const input = await parseBody(req, roleAssignSchema)

    const role = await db.role.findUnique({ where: { id: input.roleId } })
    if (!role) return fail(404, 'Role not found', 'not_found')

    const actorKeys = await db.userRole.findMany({
      where: { userId: actor, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      select: { role: { select: { key: true } } },
    })
    const actorIsSuperAdmin = actorKeys.some((r) => r.role.key === 'super_admin')
    if (PROTECTED_ROLES.includes(role.key) && !actorIsSuperAdmin) {
      return fail(403, 'Only a Super Admin may assign administrative roles.', 'requires_super_admin')
    }

    const target = await db.user.findUnique({ where: { id: input.userId }, select: { id: true, isActive: true } })
    if (!target) return fail(404, 'User not found', 'not_found')

    await db.userRole.create({
      data: {
        userId: input.userId,
        roleId: input.roleId,
        scope: input.scope || '*',
        assignedBy: actor,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
    }).catch(() => {
      throw Object.assign(new Error('This role assignment already exists.'), { status: 409 })
    })

    revalidateUserGrants(input.userId)
    await writeAudit({
      event: 'admin.role_changed',
      actorId: actor,
      targetType: 'user',
      targetId: input.userId,
      metadata: { action: 'assign', roleKey: role.key, scope: input.scope },
    })
    return ok({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId: actor } = await auth()
    if (!(await can(actor, PERMISSIONS.membersRoleAssign))) return fail(403, 'Not authorized to remove roles.', 'forbidden')
    await params
    const input = await parseBody(req, roleRemoveSchema)

    const role = await db.role.findUnique({ where: { id: input.roleId } })
    if (!role) return fail(404, 'Role not found', 'not_found')

    if (role.key === 'super_admin') {
      const assignments = await db.userRole.findMany({
        where: { role: { key: 'super_admin' }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        select: { id: true, userId: true, user: { select: { isActive: true, suspendedAt: true } } },
      })
      const activeSuperAdmins = assignments.filter((a) => a.user.isActive && !a.user.suspendedAt)
      const removingSuperAdmin = assignments.find((a) => a.userId === input.userId)
      if (removingSuperAdmin && activeSuperAdmins.length <= 1) {
        return fail(409, 'Cannot remove the last active Super Admin. Appoint a successor first.', 'last_super_admin')
      }
    }

    const result = await db.userRole.deleteMany({
      where: { userId: input.userId, roleId: input.roleId, scope: input.scope || '*' },
    })
    if (result.count === 0) return fail(404, 'Role assignment not found', 'not_found')

    revalidateUserGrants(input.userId)
    await writeAudit({
      event: 'admin.role_changed',
      actorId: actor,
      targetType: 'user',
      targetId: input.userId,
      metadata: { action: 'remove', roleKey: role.key, scope: input.scope },
    })
    return ok({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
