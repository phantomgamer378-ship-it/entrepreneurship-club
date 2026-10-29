// Check the demo member account status + who suspended it (audit trail).
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const u = await db.user.findFirst({
  where: { email: 'member@club.adypu.edu.in' },
  select: { id: true, email: true, isActive: true, suspendedAt: true, suspendedReason: true, fullName: true },
})
console.log('member account:', u)

if (u) {
  const audits = await db.auditEvent.findMany({
    where: { OR: [{ targetUserId: u.id }, { meta: { path: ['targetEmail'], equals: u.email } }] },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { action: true, createdAt: true, actorUserId: true, meta: true },
  })
  console.log('audit events touching member:', JSON.stringify(audits, null, 2))
}

const counts = await db.user.groupBy({ by: ['isActive'], _count: true })
console.log('user isActive distribution:', counts)
