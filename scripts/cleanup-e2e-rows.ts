// Removes rows created during browser E2E verification of the Super Admin Control Suite.
// Guarded per Section 25.1 — refuses non-test/local targets.
import { PrismaClient } from '@prisma/client'
import { assertTestDatabase } from '../src/lib/test-guard'

assertTestDatabase(process.env.DATABASE_URL)
const db = new PrismaClient()

const room = await db.videoRoom.findFirst({ where: { name: 'E2E All Members Broadcast' } })
if (room) {
  await db.notification.deleteMany({ where: { link: `/workspace/meet/${room.id}` } })
  await db.emailOutbox.deleteMany({ where: { relatedType: 'video_room', relatedId: room.id } })
  await db.videoRoom.delete({ where: { id: room.id } }).catch(() => undefined)
}
const u = await db.user.findUnique({ where: { email: 'e2e.member@club.adypu.edu.in' } })
if (u) await db.user.delete({ where: { id: u.id } }) // cascades profile/roles/memberships
console.log('[cleanup-e2e] done. room:', Boolean(room), 'user:', Boolean(u))
await db.$disconnect()
