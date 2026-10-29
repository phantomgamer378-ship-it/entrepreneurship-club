// PRD §7.3 — create-custom-role. Super-Admin-only (roles.create). Custom roles may
// bundle permissions EXCEPT the Super-Admin-exclusive set, regardless of caller grants.
import { db } from '@/lib/db'
import { can, PERMISSIONS, revalidateUserGrants } from '@/lib/rbac/authorize'
import { SUPER_ADMIN_EXCLUSIVE_PERMISSIONS } from '@/lib/rbac/permissions'
import { ApiError } from '@/lib/api'
import { writeAudit } from '@/lib/audit'

export type CreateCustomRoleInput = {
  name: string
  description?: string
  permissionIds: string[]
}

export async function createCustomRole(actorId: string, input: CreateCustomRoleInput): Promise<{ roleId: string }> {
  if (!(await can(actorId, PERMISSIONS.rolesCreate))) {
    throw new ApiError(403, 'Only a Super Admin can create custom roles.', 'forbidden')
  }

  const name = input.name.trim()
  if (!name) throw new ApiError(422, 'name is required.', 'validation_error')
  const key = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  if (!key) throw new ApiError(422, 'name must contain usable characters.', 'validation_error')

  const exists = await db.role.findUnique({ where: { key } })
  if (exists) throw new ApiError(409, 'A role with this name already exists.', 'role_exists')

  const permissions = await db.permission.findMany({ where: { id: { in: input.permissionIds } } })
  if (permissions.length !== new Set(input.permissionIds).size) {
    throw new ApiError(422, 'One or more permission ids are unknown.', 'invalid_permissions')
  }

  // §10: exclusivity — a new role can never bundle Super-Admin-level authority.
  const exclusive = permissions.filter((p) =>
    (SUPER_ADMIN_EXCLUSIVE_PERMISSIONS as string[]).includes(p.key)
  )
  if (exclusive.length > 0) {
    throw new ApiError(
      403,
      `Custom roles cannot include Super-Admin-exclusive permissions: ${exclusive.map((p) => p.key).join(', ')}.`,
      'escalation_blocked'
    )
  }

  const role = await db.role.create({
    data: {
      key,
      name,
      description: input.description?.trim() || null,
      isSystem: false,
      rolePermissions: {
        create: permissions.map((p) => ({
          permissionId: p.id,
          scope: '*',
          grantedBy: actorId,
        })),
      },
    },
  })

  revalidateUserGrants() // role cache is per-user; cheap full clear on role creation
  await writeAudit({
    event: 'admin.role_changed',
    actorId,
    targetType: 'role',
    targetId: role.id,
    metadata: { action: 'create_custom', key, permissions: permissions.map((p) => p.key) },
  })
  return { roleId: role.id }
}
