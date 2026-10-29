// Newsletter broadcasts to PUBLIC subscribers (visitors who opted in via the
// site footer). Confidentiality contract (Task 24):
//  - Announcements are only broadcast when audience === 'public'. Members-only
//    and leads-only announcements are NEVER emailed to public subscribers.
//  - Emails contain only fields already shown on the public website (title,
//    category, body / summary, venue, date). No member data, no recap/internal
//    notes, no recipient addresses (each subscriber receives an individual copy).
//  - Every email carries a tokenized unsubscribe link; unsubscribes take effect
//    immediately before the next broadcast.
// Delivery goes through the EmailOutbox: per-recipient idempotency keys make
// re-publishing safe (already-emailed subscribers are never emailed twice; only
// subscribers who joined in the meantime receive the item).
import { db } from '@/lib/db'
import { enqueueEmail } from '@/lib/email/outbox'
import { templates } from '@/lib/email/templates'
import { writeAudit } from '@/lib/audit'

export type BroadcastResult = {
  skipped?: string
  queued: number
  recipients: number
}

export async function broadcastAnnouncementToSubscribers(
  announcement: { id: string; title: string; body: string; category: string; audience: string },
  origin: string,
): Promise<BroadcastResult> {
  try {
    if (announcement.audience !== 'public') {
      return { skipped: `audience '${announcement.audience}' is not public — not sent to subscribers`, queued: 0, recipients: 0 }
    }
    const subscribers = await db.newsletterSubscriber.findMany({
      where: { isActive: true },
      select: { id: true, email: true, unsubscribeToken: true },
    })
    const readUrl = `${origin}/#/announcements`
    for (const sub of subscribers) {
      const unsubscribeUrl = `${origin}/api/public/subscribe/unsubscribe?token=${sub.unsubscribeToken}`
      const mail = templates.newsletterAnnouncement({
        title: announcement.title,
        body: announcement.body,
        category: announcement.category,
        readUrl,
        unsubscribeUrl,
      })
      await enqueueEmail({
        idempotencyKey: `newsletter:announcement:${announcement.id}:${sub.id}`,
        category: 'newsletter',
        to: sub.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        relatedType: 'announcement',
        relatedId: announcement.id,
      })
    }
    // emailSentAt marks "subscriber fanout done at least once" for the admin list.
    const record = await db.announcement.findUnique({ where: { id: announcement.id }, select: { emailSentAt: true } })
    if (record && record.emailSentAt === null && subscribers.length > 0) {
      await db.announcement.update({ where: { id: announcement.id }, data: { emailSentAt: new Date() } })
    }
    await writeAudit({
      event: 'newsletter.broadcast',
      targetType: 'announcement',
      targetId: announcement.id,
      metadata: { recipients: subscribers.length, audience: announcement.audience, title: announcement.title.slice(0, 120) },
    })
    return { queued: subscribers.length, recipients: subscribers.length }
  } catch (err) {
    // A newsletter failure must never break the admin publish action.
    console.error('[newsletter] announcement broadcast failed:', err)
    return { skipped: 'broadcast error (see server log)', queued: 0, recipients: 0 }
  }
}

export async function broadcastEventToSubscribers(
  eventId: string,
  origin: string,
): Promise<BroadcastResult> {
  try {
    const event = await db.clubEvent.findUnique({
      where: { id: eventId },
      select: { id: true, title: true, summary: true, venue: true, startsAt: true, status: true, isPublic: true },
    })
    if (!event) return { skipped: 'event not found', queued: 0, recipients: 0 }
    if (event.status !== 'published') {
      return { skipped: `event status '${event.status}' — only published events are sent`, queued: 0, recipients: 0 }
    }
    if (!event.isPublic) {
      return { skipped: 'event is not public — not sent to subscribers', queued: 0, recipients: 0 }
    }
    const subscribers = await db.newsletterSubscriber.findMany({
      where: { isActive: true },
      select: { id: true, email: true, unsubscribeToken: true },
    })
    const eventUrl = `${origin}/#/events`
    const when = event.startsAt.toLocaleString('en-IN', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
    })
    for (const sub of subscribers) {
      const unsubscribeUrl = `${origin}/api/public/subscribe/unsubscribe?token=${sub.unsubscribeToken}`
      const mail = templates.newsletterEvent({
        title: event.title,
        summary: event.summary,
        when,
        venue: event.venue,
        eventUrl,
        unsubscribeUrl,
      })
      await enqueueEmail({
        idempotencyKey: `newsletter:event:${event.id}:${sub.id}`,
        category: 'newsletter',
        to: sub.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        relatedType: 'club_event',
        relatedId: event.id,
      })
    }
    await writeAudit({
      event: 'newsletter.broadcast',
      targetType: 'club_event',
      targetId: event.id,
      metadata: { recipients: subscribers.length, title: event.title.slice(0, 120) },
    })
    return { queued: subscribers.length, recipients: subscribers.length }
  } catch (err) {
    console.error('[newsletter] event broadcast failed:', err)
    return { skipped: 'broadcast error (see server log)', queued: 0, recipients: 0 }
  }
}
