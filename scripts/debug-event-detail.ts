// Debug: replicate /api/public/events/[slug] logic exactly (Task 25 follow-up).
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const slug = process.argv[2] ?? 'arthotsav-alln'
  const event = await db.clubEvent.findUnique({
    where: { slug },
    select: { slug: true, title: true, status: true, isSeedData: true, deletedAt: true, startsAt: true },
  })
  const now = new Date()
  console.log('found row :', JSON.stringify(event))
  console.log('now       :', now.toISOString())
  if (event) {
    console.log('startsAt  :', event.startsAt.toISOString(), '| startsAt < now =', event.startsAt < now)
    const viewable =
      !!event &&
      !event.isSeedData &&
      !event.deletedAt &&
      (event.status === 'published' ||
        ((event.status === 'completed' || event.status === 'archived') && event.startsAt < now))
    console.log('publiclyViewable =', viewable)
  }
  // Also check total rows + slugs (any unicode surprises?)
  const all = await db.clubEvent.findMany({ select: { slug: true, status: true, deletedAt: true, isSeedData: true }, orderBy: { createdAt: 'desc' } })
  console.log('all slugs :', JSON.stringify(all.map((e) => ({ s: e.slug, st: e.status, d: !!e.deletedAt, seed: e.isSeedData }))))
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
