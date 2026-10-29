// Announcement pipeline (§13): draft → scheduled → published → archived.
// Website publication and email delivery are intentionally separate:
// publishing makes content visible; email fanout is an explicit, confirmed step.
import { db } from '@/lib/db'
import { ok, fail, handleError, auth } from '@/lib/api'
import { can, PERMISSIONS } from '@/lib/rbac/authorize'
import { writeAudit } from '@/lib/audit'
import { broadcastAnnouncementToSubscribers } from '@/lib/newsletter'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { userId } = await auth()
    if (!(await can(userId, PERMISSIONS.announcementsUpdate))) return fail(403, 'Not authorized.', 'forbidden')
    const status = new URL(req.url).searchParams.get('status') ?? 'all'
    const announcements = await db.announcement.findMany({
      where: status === 'all' ? { deletedAt: null } : { status, deletedAt: null }, // soft-deleted = history only (PRD §6)
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true, title: true, slug: true, body: true, category: true, audience: true, status: true,
        pinned: true, publishedAt: true, scheduledFor: true, emailSentAt: true, createdAt: true,
        isSeedData: true,
        recipients: { select: { status: true } },
      },
    })
    return ok({
      announcements: announcements.map((a) => ({
        ...a,
        recipientCounts: {
          queued: a.recipients.filter((r) => r.status === 'queued').length,
          sent: a.recipients.filter((r) => r.status === 'sent').length,
          failed: a.recipients.filter((r) => r.status === 'failed').length,
          total: a.recipients.length,
        },
      })),
    })
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!(await can(userId, PERMISSIONS.announcementsCreate))) return fail(403, 'Not authorized to create announcements.', 'forbidden')
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const title = String(body.title ?? '').trim()
    const text = String(body.body ?? '').trim()
    if (title.length < 3) return fail(422, 'Title is required (3+ characters).', 'validation_error')
    if (text.length < 10) return fail(422, 'Body is required (10+ characters).', 'validation_error')
    const audience = ['public', 'members', 'leads'].includes(String(body.audience)) ? String(body.audience) : 'public'
    const category = ['general', 'event', 'achievement', 'opportunity', 'urgent'].includes(String(body.category)) ? String(body.category) : 'general'
    const scheduledFor = body.scheduledFor ? new Date(String(body.scheduledFor)) : null
    const status = scheduledFor ? 'scheduled' : 'draft'

    const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)}-${Date.now().toString(36).slice(-4)}`
    const announcement = await db.announcement.create({
      data: {
        title, slug, body: text, category, audience, status,
        scheduledFor, createdById: userId,
      },
    })
    await writeAudit({ event: 'announcement.published', actorId: userId, targetType: 'announcement', targetId: announcement.id, metadata: { action: 'draft_created', audience, scheduled: Boolean(scheduledFor) } })
    return ok({ ok: true, id: announcement.id })
  } catch (err) {
    return handleError(err)
  }
}

export async function PATCH(req: Request) {
  try {
    const { userId } = await auth()
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const id = String(body.id ?? '')
    const announcement = await db.announcement.findUnique({ where: { id } })
    if (!announcement) return fail(404, 'Announcement not found', 'not_found')

    const action = String(body.action ?? '')
    if (action === 'publish') {
      if (!(await can(userId, PERMISSIONS.announcementsPublish))) return fail(403, 'Not authorized to publish.', 'forbidden')
      const publishedAt = announcement.publishedAt ?? new Date()
      await db.announcement.update({
        where: { id },
        data: { status: 'published', publishedAt, scheduledFor: null },
      })
      await writeAudit({ event: 'announcement.published', actorId: userId, targetType: 'announcement', targetId: id, metadata: { audience: announcement.audience } })
      // Newsletter fanout to PUBLIC subscribers — gated on audience='public' inside;
      // members/leads announcements are never emailed to public subscribers (Task 24).
      const newsletter = await broadcastAnnouncementToSubscribers(
        { id: announcement.id, title: announcement.title, body: announcement.body, category: announcement.category, audience: announcement.audience },
        new URL(req.url).origin,
      )
      return ok({ ok: true, newsletter })
    }
    if (action === 'archive') {
      if (!(await can(userId, PERMISSIONS.announcementsPublish))) return fail(403, 'Not authorized.', 'forbidden')
      await db.announcement.update({ where: { id }, data: { status: 'archived' } })
      return ok({ ok: true })
    }
    if (action === 'schedule') {
      if (!(await can(userId, PERMISSIONS.announcementsPublish))) return fail(403, 'Not authorized.', 'forbidden')
      const at = body.scheduledFor ? new Date(String(body.scheduledFor)) : null
      if (!at || Number.isNaN(at.getTime()) || at < new Date()) return fail(422, 'A future schedule time is required.', 'validation_error')
      await db.announcement.update({ where: { id }, data: { status: 'scheduled', scheduledFor: at } })
      return ok({ ok: true })
    }
    if (action === 'update') {
      if (!(await can(userId, PERMISSIONS.announcementsUpdate))) return fail(403, 'Not authorized.', 'forbidden')
      const data: Record<string, unknown> = { updatedById: userId }
      if (body.title !== undefined) data.title = String(body.title)
      if (body.body !== undefined) data.body = String(body.body)
      if (body.category !== undefined) data.category = String(body.category)
      if (body.audience !== undefined) data.audience = String(body.audience)
      if (body.pinned !== undefined) data.pinned = Boolean(body.pinned)
      await db.announcement.update({ where: { id }, data })
      return ok({ ok: true })
    }
    return fail(400, 'Unknown action', 'bad_action')
  } catch (err) {
    return handleError(err)
  }
}
