// Public team directory (§5.2). Section 25.2: seed/demo profiles are excluded from
// every public query path — they exist only in dev environments and only in the
// admin panel (with a seed badge).
import { db } from '@/lib/db'
import { ok, handleError } from '@/lib/api'
import type { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

/** Public team directory — only approved public profiles. Never exposes private data. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
    const role = url.searchParams.get('role') ?? ''
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1)
    const pageSize = Math.min(24, Math.max(6, Number(url.searchParams.get('pageSize') ?? '12') || 12))

    const where: Prisma.ProfileWhereInput = {
      isPublic: true,
      isSeedData: false, // Section 25.2 — seed/demo rows never render publicly
      ...(q
        ? {
            OR: [
              { displayName: { contains: q } },
              { username: { contains: q } },
              { clubRoleLabel: { contains: q } },
              { bio: { contains: q } },
            ],
          }
        : {}),
      ...(role ? { clubRoleLabel: { contains: role } } : {}),
    }

    const [total, profiles] = await Promise.all([
      db.profile.count({ where }),
      db.profile.findMany({
        where,
        orderBy: [{ clubRoleLabel: { sort: 'asc', nulls: 'last' } }, { displayName: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          username: true,
          displayName: true,
          avatarUrl: true,
          clubRoleLabel: true,
          bio: true,
          linkedinUrl: true,
          githubUrl: true,
          interests: true,
        },
      }),
    ])

    return ok({
      total,
      page,
      pageSize,
      profiles: profiles.map((p) => ({
        ...p,
        interests: safeArray(p.interests),
        // Only APPROVED public links are ever included (they are stored explicitly).
        linkedinUrl: p.linkedinUrl ?? null,
        githubUrl: p.githubUrl ?? null,
      })),
    })
  } catch (err) {
    return handleError(err)
  }
}

function safeArray(json: string | null): string[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.map(String).slice(0, 10) : []
  } catch {
    return []
  }
}
