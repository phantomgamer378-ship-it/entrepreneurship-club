// Scheduled worker endpoint (called by external cron / Supabase cron equivalent).
// Responsibilities:
//  1. Process the email outbox (bounded retries with backoff — §11).
//  2. Publish due scheduled announcements.
//  3. Queue event reminders for events starting within 48h (idempotent per event).
//  4. Expire video rooms past expiresAt.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { processOutbox } from '@/lib/email/outbox'
import { templates } from '@/lib/email/templates'
import { env } from '@/lib/env'

export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== env.cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const summary: Record<string, unknown> = {}

  // 1. Email outbox worker.
  summary.email = await processOutbox(25)

  // 2. Publish due scheduled announcements.
  const due = await db.announcement.findMany({
    where: { status: 'scheduled', scheduledFor: { lte: new Date() } },
    select: { id: true, title: true },
  })
  for (const a of due) {
    await db.announcement.update({ where: { id: a.id }, data: { status: 'published', publishedAt: new Date() } })
  }
  summary.publishedAnnouncements = due.length

  // 3. Event reminders (48h window), idempotent via idempotencyKey.
  const soon = new Date(Date.now() + 48 * 3600_000)
  const events = await db.clubEvent.findMany({
    where: { status: 'published', startsAt: { gte: new Date(), lte: soon } },
    select: { id: true, title: true, startsAt: true, venue: true },
  })
  let reminders = 0
  for (const e of events) {
    const regs = await db.eventRegistration.findMany({
      where: { eventId: e.id, status: 'confirmed' },
      select: { id: true, userId: true, guestEmail: true, user: { select: { email: true } } },
    })
    for (const r of regs) {
      const to = r.user?.email ?? r.guestEmail
      if (!to) continue
      const existing = await db.emailOutbox.findUnique({ where: { idempotencyKey: `event-reminder-${e.id}-${to}` } })
      if (existing) continue
      const tpl = templates.eventReminder(e.title, e.startsAt.toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' }), e.venue ?? 'To be announced')
      await db.emailOutbox.create({
        data: {
          idempotencyKey: `event-reminder-${e.id}-${to}`,
          category: 'event_reminder',
          toEmail: to,
          subject: tpl.subject,
          bodyHtml: tpl.html,
          bodyText: `Reminder: ${e.title} at ${e.startsAt.toISOString()}`,
          relatedType: 'club_event',
          relatedId: e.id,
        },
      })
      reminders++
    }
  }
  summary.remindersQueued = reminders

  // 4. Expire video rooms.
  const expired = await db.videoRoom.updateMany({
    where: { status: 'live', expiresAt: { lt: new Date() } },
    data: { status: 'ended' },
  })
  summary.expiredRooms = expired.count

  return NextResponse.json({ ok: true, summary, at: new Date().toISOString() })
}
