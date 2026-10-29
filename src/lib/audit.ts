// Structured security/operational audit events (§18).
// NEVER log passwords, tokens, provider secrets, or private message contents.
import { db } from '@/lib/db'

export type AuditEvent =
  | 'auth.login_succeeded'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.password_reset_requested'
  | 'auth.password_reset_completed'
  | 'auth.invite_accepted'
  | 'membership.application_submitted'
  | 'membership.application_approved'
  | 'membership.application_rejected'
  | 'membership.invite_sent'
  | 'membership.member_suspended'
  | 'membership.member_reactivated'
  | 'access.authorization_denied'
  | 'admin.role_changed'
  | 'admin.permission_granted'
  | 'admin.permission_revoked'
  | 'admin.member_created'
  | 'admin.member_updated'
  | 'admin.settings_changed'
  | 'announcement.published'
  | 'announcement.email_queued'
  | 'event.created'
  | 'event.updated'
  | 'event.published'
  | 'event.archived'
  | 'event.registration_created'
  | 'email.delivery_failed'
  | 'email.retried'
  | 'video.room_created'
  | 'video.room_access_denied'
  | 'voice.channel_created'
  | 'voice.channel_deleted'
  | 'voice.channel_joined'
  | 'moderation.report_filed'
  | 'moderation.report_resolved'
  | 'security.webhook_signature_invalid'
  | 'security.invite_abuse_suspected'

type AuditInput = {
  event: AuditEvent
  actorId?: string | null
  actorEmail?: string | null
  targetType?: string
  targetId?: string
  metadata?: unknown
  ip?: string
}

export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        event: input.event,
        actorId: input.actorId ?? undefined,
        actorEmail: input.actorEmail ?? undefined,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: input.metadata !== undefined ? JSON.stringify(sanitize(input.metadata)) : undefined,
        ip: input.ip,
      },
    })
  } catch (err) {
    // Auditing must never take down the request path, but failures are surfaced in logs.
    console.error('[audit] write failed', err)
  }
}

function sanitize(value: unknown): unknown {
  const FORBIDDEN = /(password|token|secret|apikey|api_key|authorization)/i
  if (typeof value === 'string') return value.slice(0, 500)
  if (Array.isArray(value)) return value.map(sanitize).slice(0, 50)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN.test(k)) {
        out[k] = '[redacted]'
        continue
      }
      out[k] = sanitize(v)
    }
    return out
  }
  return value
}
