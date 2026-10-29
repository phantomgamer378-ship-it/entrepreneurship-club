// Restore the documented demo member account (member@club.adypu.edu.in) that was
// suspended via the control panel during live testing (2026-10-26). The suspend
// feature worked correctly; this only restores the demo credential documented in
// README so member-side testing keeps working. Writes an AuditLog entry.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const u = await db.user.findFirst({
  where: { email: 'member@club.adypu.edu.in' },
  select: { id: true, email: true, suspendedAt: true, suspendedReason: true },
})
if (!u) throw new Error('demo member not found')
console.log('before:', u)

if (!u.suspendedAt) {
  console.log('already active — nothing to do')
  process.exit(0)
}

await db.user.update({
  where: { id: u.id },
  data: { suspendedAt: null, suspendedReason: null },
})

await db.auditLog.create({
  data: {
    actorEmail: 'platform@system',
    event: 'admin.demo_account_restored',
    targetType: 'user',
    targetId: u.id,
    metadata: JSON.stringify({
      email: u.email,
      note: 'Demo member unsuspended after control-panel suspend test; restores documented demo credential.',
      previouslySuspendedAt: u.suspendedAt?.toISOString() ?? null,
    }),
  },
})

const after = await db.user.findFirst({
  where: { email: 'member@club.adypu.edu.in' },
  select: { email: true, isActive: true, suspendedAt: true, suspendedReason: true },
})
console.log('after:', after)
