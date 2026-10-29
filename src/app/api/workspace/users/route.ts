import { db } from '@/lib/db'
import { ok, handleError, auth } from '@/lib/api'

export const dynamic = 'force-dynamic'

/** Member directory for starting conversations / inviting to meetings. */
export async function GET(req: Request) {
  try {
    await auth()
    const q = (new URL(req.url).searchParams.get('q') ?? '').trim().toLowerCase()
    const users = await db.user.findMany({
      where: {
        isActive: true,
        suspendedAt: null,
        profile: { isNot: null },
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
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        profile: { select: { username: true, displayName: true, clubRoleLabel: true, avatarUrl: true } },
      },
      take: 30,
      orderBy: { fullName: 'asc' },
    })
    return ok({
      users: users.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        username: u.profile?.username ?? null,
        displayName: u.profile?.displayName ?? u.fullName,
        clubRoleLabel: u.profile?.clubRoleLabel ?? null,
        avatarUrl: u.profile?.avatarUrl ?? null,
      })),
    })
  } catch (err) {
    return handleError(err)
  }
}
