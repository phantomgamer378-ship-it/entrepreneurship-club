import { db } from '@/lib/db'
import { ok, fail, handleError, parseBody, auth } from '@/lib/api'
import { profileUpdateSchema } from '@/lib/validations'
import { writeAudit } from '@/lib/audit'
import { revalidateUserGrants } from '@/lib/rbac/authorize'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { userId } = await auth()
    const profile = await db.profile.findUnique({
      where: { userId },
      select: {
        username: true,
        displayName: true,
        bio: true,
        clubRoleLabel: true,
        linkedinUrl: true,
        githubUrl: true,
        websiteUrl: true,
        achievements: true,
        interests: true,
        isPublic: true,
        avatarUrl: true,
      },
    })
    if (!profile) return fail(404, 'Profile not found', 'not_found')
    return ok({
      ...profile,
      achievements: safeJsonArray(profile.achievements),
      interests: safeJsonArray(profile.interests),
    })
  } catch (err) {
    return handleError(err)
  }
}

/** Users may update ONLY these permitted fields; username is immutable (public identifier). */
export async function PATCH(req: Request) {
  try {
    const { userId } = await auth()
    const input = await parseBody(req, profileUpdateSchema)
    const existing = await db.profile.findUnique({ where: { userId } })
    if (!existing) return fail(404, 'Profile not found', 'not_found')

    const profile = await db.profile.update({
      where: { userId },
      data: {
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.bio !== undefined ? { bio: input.bio || null } : {}),
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl || null } : {}),
        ...(input.linkedinUrl !== undefined ? { linkedinUrl: input.linkedinUrl || null } : {}),
        ...(input.githubUrl !== undefined ? { githubUrl: input.githubUrl || null } : {}),
        ...(input.websiteUrl !== undefined ? { websiteUrl: input.websiteUrl || null } : {}),
        ...(input.achievements !== undefined ? { achievements: JSON.stringify(input.achievements) } : {}),
        ...(input.interests !== undefined ? { interests: JSON.stringify(input.interests) } : {}),
      },
    })
    await writeAudit({ event: 'admin.member_updated', actorId: userId, targetType: 'profile', targetId: profile.id, metadata: { selfUpdate: true, fields: Object.keys(input) } })
    return ok({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}

function safeJsonArray(json: string | null): string[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}
