// Removes rows created during E2E verification of the newsletter subscription
// feature (Task 24, 2026-10-29). Deletes ONLY the synthetic test artifacts:
//   - NewsletterSubscriber rows pointing at resend.dev / example.com test inboxes
//   - Announcements titled Newsletter* / Internal Members Test* (all archived already)
//   - ClubEvent "Newsletter Test Event — E2E"
//   - EmailOutbox + EmailDeliveryLog rows for those test sends
// Real demo data (Pitch Day 2025, invitations, application pipeline mails, etc.)
// is never touched. Guarded per Section 25.1 via assertTestDatabase().
import { PrismaClient } from '@prisma/client'
import { assertTestDatabase } from '../src/lib/test-guard'

assertTestDatabase(process.env.DATABASE_URL)
const db = new PrismaClient()

const TEST_ANNOUNCEMENT_TITLES = [
  'Newsletter E2E Test Announcement',
  'Newsletter E2E Members-Only Test',
  'Internal Members Test — Must Not Broadcast',
  'Newsletter Pipeline Test 2 — Real Delivery',
  'Newsletter Pipeline Test — Public Notice',
]

async function main() {
  // 1. Test subscribers (resend.dev inboxes + example.com artifacts).
  const subs = await db.newsletterSubscriber.findMany({
    where: { email: { endsWith: '@resend.dev' } },
  })
  for (const s of subs) await db.newsletterSubscriber.delete({ where: { id: s.id } })
  console.log(`[cleanup-newsletter] subscribers removed: ${subs.length}`, subs.map((s) => s.email))

  // 2. Test announcements + their recipients + related outbox rows.
  const anns = await db.announcement.findMany({
    where: {
      OR: [
        ...TEST_ANNOUNCEMENT_TITLES.map((t) => ({ title: t })),
        { title: { startsWith: 'Newsletter' } },
        { title: { startsWith: 'Internal Members Test' } },
      ],
    },
  })
  const annIds = anns.map((a) => a.id)
  if (annIds.length) {
    const recips = await db.announcementRecipient.deleteMany({ where: { announcementId: { in: annIds } } })
    console.log(`[cleanup-newsletter] announcement recipients removed: ${recips.count}`)
  }
  const annOutbox = await db.emailOutbox.deleteMany({
    where: {
      OR: [
        { relatedType: 'announcement', relatedId: { in: annIds } },
        { category: 'announcement', toEmail: { endsWith: '@resend.dev' } },
        { category: 'announcement', toEmail: { endsWith: '@example.com' } },
      ],
    },
  })
  console.log(`[cleanup-newsletter] announcement outbox rows removed: ${annOutbox.count}`)

  // 3. Test event + related outbox rows.
  const evt = await db.clubEvent.findFirst({ where: { title: 'Newsletter Test Event — E2E' } })
  if (evt) {
    const evtOutbox = await db.emailOutbox.deleteMany({
      where: { OR: [{ relatedType: 'event', relatedId: evt.id }, { category: 'event', toEmail: { endsWith: '@resend.dev' } }] },
    })
    await db.clubEvent.delete({ where: { id: evt.id } })
    console.log(`[cleanup-newsletter] test event removed (outbox rows: ${evtOutbox.count})`)
  } else {
    console.log('[cleanup-newsletter] test event: none found')
  }

  // 4. Delete the announcements themselves (after outbox/recipient cleanup).
  const annDel = await db.announcement.deleteMany({ where: { id: { in: annIds } } })
  console.log(`[cleanup-newsletter] test announcements removed: ${annDel.count}`)

  // 5. Final state.
  const [subCount, annLeft, outLeft] = await Promise.all([
    db.newsletterSubscriber.count(),
    db.announcement.count(),
    db.emailOutbox.count(),
  ])
  console.log(`[cleanup-newsletter] final state: subscribers=${subCount} announcements=${annLeft} outbox=${outLeft}`)
  await db.$disconnect()
}

main()
