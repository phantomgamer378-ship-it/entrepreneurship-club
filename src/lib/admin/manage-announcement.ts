// PRD §7.4 — admin-manage-announcement. Super-power override beyond author scope:
//   delete          → soft delete (deleted_at). Record stays queryable for history.
//   force_unpublish → status back to draft.
// LIMITATION (surfaced in the admin UI confirmation dialog): emails already sent via
// the provider cannot be recalled. This action does NOT touch outbox rows already
// marked 'sent' and never re-enqueues them.
import { db } from '@/lib/db'
import { can, PERMISSIONS } from '@/lib/rbac/authorize'
import { ApiError } from '@/lib/api'
import { writeAudit } from '@/lib/audit'

export type ManageAnnouncementAction = 'delete' | 'force_unpublish'

export async function manageAnnouncement(
  actorId: string,
  announcementId: string,
  action: ManageAnnouncementAction,
  reason?: string
): Promise<void> {
  if (!(await can(actorId, PERMISSIONS.announcementsDelete))) {
    throw new ApiError(403, 'Not authorized to manage announcements.', 'forbidden')
  }

  const announcement = await db.announcement.findUnique({ where: { id: announcementId } })
  if (!announcement) throw new ApiError(404, 'Announcement not found.', 'not_found')

  if (action === 'delete') {
    if (announcement.deletedAt) {
      throw new ApiError(409, 'Announcement is already deleted.', 'already_deleted')
    }
    await db.announcement.update({
      where: { id: announcementId },
      data: { deletedAt: new Date(), status: 'archived' },
    })
  } else {
    if (announcement.deletedAt) {
      throw new ApiError(409, 'Announcement is deleted.', 'already_deleted')
    }
    await db.announcement.update({
      where: { id: announcementId },
      data: { status: 'draft' },
    })
  }

  // Outbox rows already 'sent' are intentionally left untouched (audit history).
  await writeAudit({
    event: 'admin.announcement_managed',
    actorId,
    targetType: 'announcement',
    targetId: announcementId,
    metadata: { action, reason: reason ?? null, title: announcement.title },
  })
}
