import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const events = await db.clubEvent.findMany({
    orderBy: { createdAt: 'desc' as const },
    take: 10,
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      isSeedData: true,
      deletedAt: true,
      startsAt: true,
      createdAt: true,
    },
  })
  console.log(JSON.stringify(events, null, 2))
  console.log('NOW =', new Date().toISOString())
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
