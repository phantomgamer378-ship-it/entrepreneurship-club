/**
 * Check demo accounts status; un-suspend the demo member if needed.
 * (Sandbox was restored from an Oct 26 snapshot that predates the Oct 27 member restore.)
 */
import { db } from '../src/lib/db'

async function main() {
  const users = await db.user.findMany({
    where: { email: { in: ['member@club.adypu.edu.in', 'superadmin@club.adypu.edu.in'] } },
    select: { id: true, email: true, isActive: true, suspendedAt: true, suspendedReason: true },
  })
  console.log('current state:', JSON.stringify(users, null, 2))

  const member = users.find((u) => u.email === 'member@club.adypu.edu.in')
  if (member && (member.suspendedAt || !member.isActive)) {
    await db.user.update({
      where: { id: member.id },
      data: { suspendedAt: null, suspendedReason: null, isActive: true },
    })
    await db.auditLog.create({
      data: {
        actorEmail: 'platform@system',
        event: 'admin.demo_account_restored',
        targetType: 'user',
        targetId: member.id,
        metadata: JSON.stringify({
          email: member.email,
          note: 'Re-applied after sandbox restore from Oct 26 snapshot',
        }),
      },
    })
    console.log('member restored: cleared suspendedAt, isActive=true, audit event written')
  } else {
    console.log('member already active — no action needed')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
