// Member management (§7.3): list, update metadata, suspend/reactivate.
// Role changes live in ./[id]/roles. Historical records are never deleted on role change.
// POST (PRD §7.1): direct member creation — invite or active — guarded by members.create.
import { db } from '@/lib/db'
import { ok, fail, handleError, parseBody, auth } from '@/lib/api'
import { can, PERMISSIONS, activeSuperAdminCount } from '@/lib/rbac/authorize'
import { writeAudit } from '@/lib/audit'
import { createMember } from '@/lib/admin/create-member'
import { adminCreateMemberSchema } from '@/lib/validations'
import type { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { userId } = await auth()
    if (!(await can(userId, PERMISSIONS.membersRead))) return fail(403, 'Not authorized.', 'forbidden')
    const url = new URL(req.url)
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
    const teacherOnly = url.searchParams.get('teachers') === 'true'

    const where: Prisma.UserWhereInput = {
      ...(q
        ? {
            OR: [
              { fullName: { contains: q } },
              { email: { contains: q } },
              { profile: { is: { displayName: { contains: q } } } },
              { profile: { is: { username: { contains: q } } } },
            ],
          }
        : {}),
      ...(teacherOnly ? { userRoles: { some: { role: { key: 'faculty_advisor' } } } } : {}),
    }

    const users = await db.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
        suspendedAt: true,
        suspendedReason: true,
        lastLoginAt: true,
        createdAt: true,
        profile: { select: { id: true, username: true, displayName: true, clubRoleLabel: true, isPublic: true, avatarUrl: true, linkedinUrl: true, githubUrl: true, interests: true } },
        userRoles: {
          select: { id: true, scope: true, expiresAt: true, role: { select: { id: true, key: true, name: true } }, assignedBy: true, assignedAt: true },
        },
      },
    })
    return ok({ users })
  } catch (err) {
    return handleError(err)
  }
}

export async function PATCH(req: Request) {
  try {
    const { userId: actor, email: actorEmail } = await auth()
    const body = (await req.json().catch(() => ({}))) as {
      targetId?: string
      action?: 'suspend' | 'reactivate' | 'update'
      reason?: string
      fullName?: string
      isPublic?: boolean
      clubRoleLabel?: string
      avatarUrl?: string
      linkedinUrl?: string
      githubUrl?: string
      interests?: string[]
    }
    if (!body.targetId || !body.action) return fail(400, 'targetId and action are required', 'missing_param')
    const target = await db.user.findUnique({ where: { id: body.targetId }, include: { userRoles: { select: { role: { select: { key: true } } } } } })
    if (!target) return fail(404, 'Member not found', 'not_found')
    const targetIsSuperAdmin = target.userRoles.some((r) => r.role.key === 'super_admin')

    if (body.action === 'suspend') {
      if (!(await can(actor, PERMISSIONS.membersSuspend))) return fail(403, 'Not authorized to suspend members.', 'forbidden')
      if (targetIsSuperAdmin) {
        // Never let an operation lock out the last super admin (§21 test).
        const remaining = await activeSuperAdminCount()
        if (remaining <= 1) return fail(409, 'Cannot suspend the last active Super Admin.', 'last_super_admin')
      }
      if (target.id === actor) return fail(409, 'You cannot suspend your own account.', 'self_suspend')
      await db.user.update({
        where: { id: target.id },
        data: { suspendedAt: new Date(), suspendedReason: (body.reason ?? '').slice(0, 500) },
      })
      await writeAudit({ event: 'membership.member_suspended', actorId: actor, targetType: 'user', targetId: target.id, metadata: { reason: body.reason ?? null } })
      return ok({ ok: true })
    }

    if (body.action === 'reactivate') {
      if (!(await can(actor, PERMISSIONS.membersSuspend))) return fail(403, 'Not authorized.', 'forbidden')
      await db.user.update({ where: { id: target.id }, data: { suspendedAt: null, suspendedReason: null } })
      await writeAudit({ event: 'membership.member_reactivated', actorId: actor, targetType: 'user', targetId: target.id })
      return ok({ ok: true })
    }

    if (body.action === 'update') {
      if (!(await can(actor, PERMISSIONS.membersUpdate))) return fail(403, 'Not authorized.', 'forbidden')
      const data: { fullName?: string } = {}
      if (body.fullName !== undefined) data.fullName = body.fullName
      await db.user.update({ where: { id: target.id }, data })
      // Public-facing profile fields an admin may set on behalf of a member.
      // Same protocol rule as profileUpdateSchema: http(s):// or site-relative /path only.
      const safeUrl = (v: string | undefined) => {
        const t = (v ?? '').trim()
        return t && (t.startsWith('/') || /^https?:\/\/\S+$/i.test(t)) ? t : null
      }
      const profileData: { isPublic?: boolean; clubRoleLabel?: string | null; avatarUrl?: string | null; linkedinUrl?: string | null; githubUrl?: string | null; interests?: string | null } = {}
      if (body.isPublic !== undefined) profileData.isPublic = body.isPublic
      if (body.clubRoleLabel !== undefined) profileData.clubRoleLabel = body.clubRoleLabel || null
      if (body.avatarUrl !== undefined) profileData.avatarUrl = safeUrl(body.avatarUrl)
      if (body.linkedinUrl !== undefined) profileData.linkedinUrl = safeUrl(body.linkedinUrl)
      if (body.githubUrl !== undefined) profileData.githubUrl = safeUrl(body.githubUrl)
      if (body.interests !== undefined) profileData.interests = Array.isArray(body.interests) ? JSON.stringify(body.interests) : null
      if (Object.keys(profileData).length > 0) {
        const profile = await db.profile.findUnique({ where: { userId: target.id } })
        if (profile) {
          await db.profile.update({ where: { userId: target.id }, data: profileData })
        }
      }
      await writeAudit({ event: 'admin.member_updated', actorId: actor, targetType: 'user', targetId: target.id, metadata: { fields: { fullName: body.fullName !== undefined, isPublic: body.isPublic, clubRoleLabel: body.clubRoleLabel, avatarUrl: body.avatarUrl !== undefined, linkedinUrl: body.linkedinUrl !== undefined, githubUrl: body.githubUrl !== undefined, interests: body.interests !== undefined } } })
      return ok({ ok: true })
    }

    return fail(400, 'Unknown action', 'bad_action')
  } catch (err) {
    return handleError(err)
  }
}

/** PRD §7.1 — admin-create-member: invite (default, safer) or create-active-now. */
export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    const input = await parseBody(req, adminCreateMemberSchema)
    const origin = new URL(req.url).origin
    const result = await createMember(userId, { ...input, origin })
    return ok({ ok: true, ...result }, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
