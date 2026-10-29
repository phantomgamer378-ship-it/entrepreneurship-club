// Authorization core — deny by default, DB-backed, scope- and expiry-aware.
// This module is the SINGLE authority used by every API route. Frontend labels are
// cosmetic only and are never a security control (§8).
import { db } from '@/lib/db'
import { PERMISSIONS } from './permissions'

// Re-exported for convenience so routes can import the full RBAC surface from one module.
export { PERMISSIONS, ALL_PERMISSION_KEYS } from './permissions'
export type { PermissionKey } from './permissions'

export type Grant = { key: string; scope: string }

export type Subject = {
  userId: string
  isActive: boolean
  suspendedAt: Date | null
}

type CacheEntry = { grants: Grant[]; at: number }
// Short-lived per-process cache; privilege changes take effect within TTL.
// Admin role changes also bust via revalidateUserGrants().
const CACHE_TTL_MS = 5_000
const grantsCache = new Map<string, CacheEntry>()

export function revalidateUserGrants(userId?: string) {
  if (userId) grantsCache.delete(userId)
  else grantsCache.clear()
}

/**
 * Loads the effective permission grants for a user:
 * union of (active, non-expired) role grants + per-user grants.
 */
export async function getUserGrants(userId: string): Promise<Grant[]> {
  const cached = grantsCache.get(userId)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.grants

  const now = new Date()
  const [user, roleGrants, userGrants] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { isActive: true, suspendedAt: true } }),
    db.userRole.findMany({
      where: { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      select: { scope: true, role: { select: { rolePermissions: { select: { scope: true, permission: { select: { key: true } } } } } } },
    }),
    db.userPermission.findMany({
      where: { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      select: { scope: true, permission: { select: { key: true } } },
    }),
  ])

  if (!user || !user.isActive || user.suspendedAt) {
    grantsCache.set(userId, { grants: [], at: Date.now() })
    return []
  }

  const grants: Grant[] = []
  for (const ur of roleGrants) {
    for (const rp of ur.role.rolePermissions) {
      // Effective scope is the intersection of assignment scope and grant scope.
      // For simplicity: if either is '*', result is the other; else the assignment scope
      // (narrower, resource-specific) wins.
      const scope =
        ur.scope === '*' ? rp.scope : rp.scope === '*' ? ur.scope : ur.scope
      grants.push({ key: rp.permission.key, scope })
    }
  }
  for (const up of userGrants) grants.push({ key: up.permission.key, scope: up.scope })

  grantsCache.set(userId, { grants, at: Date.now() })
  return grants
}

/** Scope match: grant '*' matches everything; 'event:abc' matches resource event id abc. */
export function scopeMatches(grantScope: string, resource?: { type: string; id?: string }): boolean {
  if (grantScope === '*') return true
  if (!resource) return false
  const [type, id] = grantScope.split(':')
  if (type !== resource.type) return false
  if (!id || id === '*') return true
  return id === resource.id
}

/** Pure check — exported for unit tests. */
export function canWithGrants(
  grants: Grant[],
  permission: string,
  resource?: { type: string; id?: string }
): boolean {
  return grants.some((g) => g.key === permission && scopeMatches(g.scope, resource))
}

export async function can(
  userId: string,
  permission: string,
  resource?: { type: string; id?: string }
): Promise<boolean> {
  const grants = await getUserGrants(userId)
  return canWithGrants(grants, permission, resource)
}

export class AuthorizationError extends Error {
  status: number
  constructor(message = 'Authorization denied', status = 403) {
    super(message)
    this.status = status
  }
}

/** Throws AuthorizationError when the permission is not granted. */
export async function requirePermission(
  userId: string,
  permission: string,
  resource?: { type: string; id?: string }
): Promise<void> {
  const allowed = await can(userId, permission, resource)
  if (!allowed) {
    const { writeAudit } = await import('@/lib/audit')
    await writeAudit({
      event: 'access.authorization_denied',
      actorId: userId,
      metadata: { permission, resource },
    })
    throw new AuthorizationError()
  }
}

export async function requireAuth(userId: string | null): Promise<string> {
  if (!userId) throw new AuthorizationError('Authentication required', 401)
  return userId
}

/** Role helpers ---------------------------------------------------------- */

export async function getUserRoleKeys(userId: string): Promise<string[]> {
  const rows = await db.userRole.findMany({
    where: { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    select: { role: { select: { key: true } } },
  })
  return rows.map((r) => r.role.key)
}

export async function hasRole(userId: string, roleKey: string): Promise<boolean> {
  return (await getUserRoleKeys(userId)).includes(roleKey)
}

export async function activeSuperAdminCount(): Promise<number> {
  const role = await db.role.findUnique({ where: { key: 'super_admin' }, select: { id: true } })
  if (!role) return 0
  const rows = await db.userRole.findMany({
    where: { roleId: role.id, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    select: { userId: true, user: { select: { isActive: true, suspendedAt: true } } },
  })
  return rows.filter((r) => r.user.isActive && !r.user.suspendedAt).length
}

export const ROLE_KEYS = {
  visitor: 'visitor',
  pendingMember: 'pending_member',
  member: 'member',
  clubLead: 'club_lead',
  operationalCeo: 'operational_ceo',
  ceoTraining: 'ceo_training',
  ceoInternship: 'ceo_internship',
  secretary: 'secretary',
  cfo: 'cfo',
  cmo: 'cmo',
  ctoOperational: 'cto_operational',
  cto: 'cto',
  clubPresident: 'club_president',
  facultyAdvisor: 'faculty_advisor',
  admin: 'admin',
  superAdmin: 'super_admin',
} as const
