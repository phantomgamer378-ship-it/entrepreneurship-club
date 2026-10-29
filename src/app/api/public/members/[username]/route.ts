import { db } from '@/lib/db'
import { ok, fail, handleError } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ username: string }> }) {
  try {
    const { username } = await params
    const profile = await db.profile.findUnique({
      where: { username: username.toLowerCase() },
      select: {
        username: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        clubRoleLabel: true,
        linkedinUrl: true,
        githubUrl: true,
        websiteUrl: true,
        achievements: true,
        interests: true,
        isPublic: true,
        isSeedData: true,
        user: { select: { isActive: true, suspendedAt: true } },
      },
    })
    // Section 25.2 — seed/demo profiles never render publicly.
    if (!profile || !profile.isPublic || profile.isSeedData || !profile.user.isActive || profile.user.suspendedAt) {
      return fail(404, 'Member not found', 'not_found')
    }
    const { user: _user, ...safe } = profile
    return ok({
      ...safe,
      achievements: safeJsonArray(safe.achievements),
      interests: safeJsonArray(safe.interests),
    })
  } catch (err) {
    return handleError(err)
  }
}

function safeJsonArray(json: string | null): string[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.map(String).slice(0, 20) : []
  } catch {
    return []
  }
}
