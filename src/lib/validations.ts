// Zod validation schemas shared by client forms and API routes (single source of truth).
import { z } from 'zod'

export const usernameSchema = z
  .string()
  .min(3, 'At least 3 characters')
  .max(30, 'At most 30 characters')
  .regex(/^[a-z0-9][a-z0-9_.-]*[a-z0-9]$/, 'Lowercase letters, numbers, dot, dash, underscore')
  .transform((v) => v.toLowerCase())

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
})
export type LoginInput = z.infer<typeof loginSchema>

export const applicationSchema = z
  .object({
    requestedUsername: usernameSchema,
    email: z.string().email(),
    fullName: z.string().min(2, 'Full name is required').max(120),
    courseYear: z.string().max(80).optional().or(z.literal('')),
    interestArea: z.string().max(120).optional().or(z.literal('')),
    motivation: z.string().min(30, 'Tell us a bit more (30+ characters)').max(4000),
    portfolioUrl: z.string().url().optional().or(z.literal('')),
    linkedinUrl: z.string().url().optional().or(z.literal('')),
    githubUrl: z.string().url().optional().or(z.literal('')),
    // Anti-spam: honeypot must stay empty; minimum fill time 3s.
    website: z.string().max(0).optional().or(z.literal('')),
    elapsedMs: z.number().int().min(0),
  })
  .superRefine((val, ctx) => {
    if (val.website && val.website.length > 0) {
      ctx.addIssue({ code: 'custom', message: 'Spam detected', path: ['website'] })
    }
    if (val.elapsedMs < 3000) {
      ctx.addIssue({ code: 'custom', message: 'Form submitted too quickly', path: ['elapsedMs'] })
    }
  })
export type ApplicationInput = z.infer<typeof applicationSchema>

export const eventRegistrationSchema = z.object({
  guestName: z.string().min(2).max(120).optional().or(z.literal('')),
  guestEmail: z.string().email().optional().or(z.literal('')),
  // Task 25 — standard registration questions (kept server-validated).
  year: z.string().min(1).max(60).optional(),
  branch: z.string().min(1).max(120).optional(),
  phone: z
    .string()
    .min(6, 'Phone number looks too short')
    .max(20)
    .regex(/^[+()\-\s0-9]+$/, 'Phone number can only contain digits and + ( ) -')
    .optional(),
})

export const acceptInviteSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(10, 'At least 10 characters').regex(/[A-Za-z]/, 'Needs a letter').regex(/[0-9]/, 'Needs a number'),
  displayName: z.string().min(2).max(120),
})

export const forgotPasswordSchema = z.object({ email: z.string().email() })

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(10, 'At least 10 characters').regex(/[A-Za-z]/, 'Needs a letter').regex(/[0-9]/, 'Needs a number'),
})

export const profileUpdateSchema = z.object({
  displayName: z.string().min(2).max(120).optional(),
  bio: z.string().max(2000).optional().or(z.literal('')),
  // Photo: absolute http(s) URL or a site-relative path (e.g. /avatars/x.png).
  // Rendered into <img src>, so javascript:/data: URLs are rejected outright.
  avatarUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === '' || v.startsWith('/') || /^https?:\/\/\S+$/i.test(v), 'Must be an http(s):// URL or a /path')
    .optional(),
  linkedinUrl: z.string().url().max(300).optional().or(z.literal('')),
  githubUrl: z.string().url().max(300).optional().or(z.literal('')),
  websiteUrl: z.string().url().max(300).optional().or(z.literal('')),
  achievements: z.array(z.string().max(200)).max(20).optional(),
  interests: z.array(z.string().max(60)).max(15).optional(),
})

export const sendMessageSchema = z.object({ body: z.string().min(1).max(4000) })

export const createConversationSchema = z.object({
  type: z.enum(['direct', 'group']),
  memberIds: z.array(z.string()).min(1).max(50),
  name: z.string().max(120).optional(),
})

export const createMeetingSchema = z.object({
  name: z.string().min(2).max(120),
  accessLevel: z.enum(['members', 'leads', 'invitees']).default('members'),
  inviteeIds: z.array(z.string()).max(100).optional(),
  startsAt: z.string().datetime().optional().or(z.literal('')),
  expiresHours: z.number().int().min(1).max(720).default(24),
})

export const applicationDecisionSchema = z.object({
  action: z.enum(['approve', 'reject']),
  notes: z.string().max(4000).optional().or(z.literal('')),
})

export const reviewNotesSchema = z.object({ notes: z.string().max(4000) })

export const memberUpdateSchema = z.object({
  fullName: z.string().min(2).max(120).optional(),
  isPublic: z.boolean().optional(),
  clubRoleLabel: z.string().max(80).optional().or(z.literal('')),
})

export const roleAssignSchema = z.object({
  userId: z.string(),
  roleId: z.string(),
  scope: z.string().max(200).default('*'),
  expiresAt: z.string().datetime().optional().or(z.literal('')),
})

export const roleRemoveSchema = z.object({ userId: z.string(), roleId: z.string(), scope: z.string().default('*') })

export const permissionGrantSchema = z.object({
  roleId: z.string().optional(),
  userId: z.string().optional(),
  permissionId: z.string(),
  scope: z.string().max(200).default('*'),
})

export const permissionRevokeSchema = z.object({
  roleId: z.string().optional(),
  userId: z.string().optional(),
  permissionId: z.string(),
  scope: z.string().default('*'),
})

export const eventSchema = z.object({
  title: z.string().min(3).max(160),
  summary: z.string().max(300).optional().or(z.literal('')),
  description: z.string().min(10).max(20000),
  venue: z.string().max(200).optional().or(z.literal('')),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional().or(z.literal('')),
  capacity: z.number().int().min(1).max(100000).optional(),
  registrationOpen: z.boolean().default(true),
  registrationDeadline: z.string().datetime().optional().or(z.literal('')),
  posterUrl: z.string().url().max(500).optional().or(z.literal('')),
  featured: z.boolean().default(false),
})

export const announcementSchema = z.object({
  title: z.string().min(3).max(200),
  body: z.string().min(10).max(50000),
  category: z.enum(['general', 'event', 'achievement', 'opportunity', 'urgent']).default('general'),
  audience: z.enum(['public', 'members', 'leads']).default('public'),
  scheduledFor: z.string().datetime().optional().or(z.literal('')),
})

export const inviteCreateSchema = z.object({
  email: z.string().email(),
  type: z.enum(['member', 'teacher']).default('member'),
  roleKey: z.string().default('member'),
})

export const settingsPatchSchema = z.object({
  key: z.string().min(1).max(80),
  value: z.unknown(),
})

export const reportMessageSchema = z.object({
  messageId: z.string(),
  reason: z.string().min(3).max(1000),
})

// ───────── PRD: Super Admin Control Suite ─────────

export const adminCreateMemberSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(40).regex(/^[a-z0-9_.-]+$/, 'lowercase letters, digits, dot, dash, underscore only'),
  displayName: z.string().min(2).max(120),
  roleId: z.string().optional(),
  roleKey: z.string().optional(),
  mode: z.enum(['invite', 'active']),
  // §5.2 — approve the profile for the public team directory at creation time
  // (invite mode: recorded on the invite; active mode: set on the new profile).
  isPublic: z.boolean().optional(),
}).refine((v) => Boolean(v.roleId || v.roleKey), { message: 'roleId or roleKey is required' })

export const createVoiceChannelSchema = z.object({
  name: z.string().min(2).max(40).trim(),
  topic: z.string().max(200).trim().optional(),
})

export const createCustomRoleSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(300).optional(),
  permissionIds: z.array(z.string()).max(100).default([]),
})

export const adminManageAnnouncementSchema = z.object({
  action: z.enum(['delete', 'force_unpublish']),
  reason: z.string().max(500).optional(),
})

export const adminManageEventSchema = z.object({
  action: z.enum(['delete', 'force_cancel', 'add_registrant', 'remove_registrant']),
  reason: z.string().max(500).optional(),
  payload: z
    .object({
      userId: z.string().optional(),
      email: z.string().email().optional(),
      username: z.string().optional(),
      guestName: z.string().max(120).optional(),
    })
    .optional(),
})

export const broadcastMeetingSchema = z.object({
  title: z.string().min(3).max(150),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  audienceType: z.enum(['role', 'event', 'all_members', 'direct_invite']),
  audienceRef: z.string().optional(),
  invitedUserIds: z.array(z.string()).max(500).optional(),
})

export const automationRunSchema = z.object({
  job: z.enum([
    'auto-archive-past-events',
    'auto-expire-scoped-permissions',
    'meeting-lifecycle-sweep',
    'stale-application-digest',
    'all',
  ]),
})
