import { db } from '@/lib/db'
import { ok, fail, handleError, auth } from '@/lib/api'
import { can, PERMISSIONS } from '@/lib/rbac/authorize'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { userId } = await auth()
    if (!(await can(userId, PERMISSIONS.applicationsRead))) {
      return fail(403, 'Not authorized to view applications.', 'forbidden')
    }
    const status = new URL(req.url).searchParams.get('status') ?? 'pending'
    const where = status === 'all' ? {} : { status }
    const applications = await db.memberApplication.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        reference: true,
        requestedUsername: true,
        email: true,
        fullName: true,
        courseYear: true,
        interestArea: true,
        motivation: true,
        portfolioUrl: true,
        linkedinUrl: true,
        githubUrl: true,
        status: true,
        reviewNotes: true, // reviewers only — never exposed publicly
        reviewedBy: true,
        reviewedAt: true,
        createdAt: true,
        invites: { select: { id: true, status: true, sentCount: true, lastSentAt: true, expiresAt: true } },
      },
    })
    return ok({ applications })
  } catch (err) {
    return handleError(err)
  }
}
