// Registration list + attendance marking (§12 steps 10–11).
import { db } from '@/lib/db'
import { ok, fail, handleError, auth } from '@/lib/api'
import { can, PERMISSIONS } from '@/lib/rbac/authorize'
import { writeAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth()
    if (!(await can(userId, PERMISSIONS.eventsRegistrationsRead))) return fail(403, 'Not authorized.', 'forbidden')
    const { id } = await params
    const registrations = await db.eventRegistration.findMany({
      where: { eventId: id },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true, userId: true, guestName: true, guestEmail: true, status: true, createdAt: true,
        year: true, branch: true, phone: true, googleSyncedAt: true, googleSyncError: true,
        user: { select: { fullName: true, email: true, profile: { select: { username: true, displayName: true } } } },
      },
    })
    // Task 25 — Google-Sheets-ready CSV export (import into Sheets or the event's
    // linked Google Sheet when Forms sync is configured).
    const format = new URL(req.url).searchParams.get('format')
    if (format === 'csv') {
      const event = await db.clubEvent.findUnique({ where: { id }, select: { title: true, slug: true } })
      const esc = (v: string | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`
      const rows = [
        ['Name', 'Email', 'Educational year', 'Branch', 'Phone', 'Type', 'Status', 'Registered at', 'Google synced'].map(esc).join(','),
        ...registrations.map((r) =>
          [
            r.user?.profile?.displayName ?? r.user?.fullName ?? r.guestName ?? '(unknown)',
            r.user?.email ?? r.guestEmail ?? '(unknown)',
            r.year ?? '',
            r.branch ?? '',
            r.phone ?? '',
            r.userId ? 'member' : 'guest',
            r.status,
            r.createdAt.toISOString(),
            r.googleSyncedAt ? r.googleSyncedAt.toISOString() : '',
          ]
            .map(esc)
            .join(',')
        ),
      ]
      const slug = event?.slug ?? id
      await writeAudit({ event: 'event.registrations_exported', actorId: userId, targetType: 'club_event', targetId: id, metadata: { count: registrations.length } })
      return new Response('\uFEFF' + rows.join('\r\n'), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="registrations-${slug}.csv"`,
        },
      })
    }
    return ok({
      registrations: registrations.map((r) => ({
        id: r.id,
        name: r.user?.profile?.displayName ?? r.user?.fullName ?? r.guestName ?? '(unknown)',
        email: r.user?.email ?? r.guestEmail ?? '(unknown)',
        isGuest: !r.userId,
        status: r.status,
        createdAt: r.createdAt,
        year: r.year,
        branch: r.branch,
        phone: r.phone,
        googleSyncedAt: r.googleSyncedAt,
        googleSyncError: r.googleSyncError,
      })),
    })
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth()
    if (!(await can(userId, PERMISSIONS.eventsRegistrationsRead))) return fail(403, 'Not authorized.', 'forbidden')
    const { id } = await params
    const body = (await req.json().catch(() => ({}))) as { registrationId?: string; status?: string }
    if (!body.registrationId || !body.status || !['attended', 'no_show', 'confirmed', 'cancelled'].includes(body.status)) {
      return fail(422, 'registrationId and a valid status are required.', 'validation_error')
    }
    const reg = await db.eventRegistration.findUnique({ where: { id: body.registrationId }, select: { id: true, eventId: true } })
    if (!reg || reg.eventId !== id) return fail(404, 'Registration not found', 'not_found')
    await db.eventRegistration.update({ where: { id: reg.id }, data: { status: body.status } })
    await writeAudit({ event: 'event.updated', actorId: userId, targetType: 'event_registration', targetId: reg.id, metadata: { attendance: body.status } })
    return ok({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
