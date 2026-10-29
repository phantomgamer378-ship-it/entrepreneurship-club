import { db } from '@/lib/db'
import { ok, handleError } from '@/lib/api'
import { getSessionUserId } from '@/lib/auth/session'
import { getUserGrants, getUserRoleKeys } from '@/lib/rbac/authorize'

/** Returns the current session: user, roles (for display) and effective permission keys. */
export async function GET() {
  try {
    const userId = await getSessionUserId()
    if (!userId) return ok({ authenticated: false })
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
        suspendedAt: true,
        profile: { select: { username: true, displayName: true, avatarUrl: true, clubRoleLabel: true } },
      },
    })
    if (!user || !user.isActive || user.suspendedAt) return ok({ authenticated: false })
    const [roles, grants] = await Promise.all([getUserRoleKeys(userId), getUserGrants(userId)])
    return ok({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        username: user.profile?.username ?? null,
        displayName: user.profile?.displayName ?? user.fullName,
        avatarUrl: user.profile?.avatarUrl ?? null,
        clubRoleLabel: user.profile?.clubRoleLabel ?? null,
      },
      roles,
      permissions: [...new Set(grants.map((g) => g.key))],
    })
  } catch (err) {
    return handleError(err)
  }
}
