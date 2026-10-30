// Central permission catalog (§8 of requirements) and default role grants.
// The database is the source of truth; this module seeds it and provides the typed keys.

export const PERMISSIONS = {
  // general
  dashboardView: 'dashboard.view',

  // applications
  applicationsRead: 'applications.read',
  applicationsReview: 'applications.review',
  applicationsApprove: 'applications.approve',
  applicationsReject: 'applications.reject',

  // members
  membersRead: 'members.read',
  membersInvite: 'members.invite',
  membersUpdate: 'members.update',
  membersSuspend: 'members.suspend',
  membersRoleAssign: 'members.role.assign',
  membersPermissionsGrant: 'members.permissions.grant',
  // Super-Admin-exclusive (PRD §5 — never granted to Admin):
  membersCreate: 'members.create',
  membersDelete: 'members.delete',

  // teachers
  teachersManage: 'teachers.manage',

  // events
  eventsCreate: 'events.create',
  eventsUpdate: 'events.update',
  eventsPublish: 'events.publish',
  eventsArchive: 'events.archive',
  eventsRegistrationsRead: 'events.registrations.read',
  eventsRegistrationsManage: 'events.registrations.manage',
  eventsDelete: 'events.delete',

  // announcements
  announcementsCreate: 'announcements.create',
  announcementsUpdate: 'announcements.update',
  announcementsPublish: 'announcements.publish',
  announcementsEmailSend: 'announcements.email.send',
  announcementsDelete: 'announcements.delete',

  // messaging & video
  messagesUse: 'messages.use',
  messagesModerate: 'messages.moderate',
  videoCreate: 'video.create',
  videoModerate: 'video.moderate',
  // Voice lounge (Discord-style channels). Joining needs no permission — every
  // signed-in member may join; managing channels does.
  voiceManage: 'voice.manage',
  // Super-Admin-exclusive:
  videoCreateBroadcast: 'video.create.broadcast',
  videoEndForAll: 'video.end_for_all',

  // governance
  auditRead: 'audit.read',
  settingsManage: 'settings.manage',
  // Super-Admin-exclusive:
  rolesCreate: 'roles.create',
  // Automations dashboard (view-only; jobs run via cron):
  automationsRead: 'automations.read',
} as const

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export const ALL_PERMISSION_KEYS = Object.values(PERMISSIONS) as PermissionKey[]

export const CLUB_LEAD_PERMISSIONS: PermissionKey[] = [
  PERMISSIONS.dashboardView,
  PERMISSIONS.messagesUse,
  PERMISSIONS.videoCreate,
  PERMISSIONS.eventsCreate,
  PERMISSIONS.eventsUpdate,
  PERMISSIONS.eventsRegistrationsRead,
  PERMISSIONS.announcementsCreate,
  PERMISSIONS.announcementsUpdate,
]

export const ADMIN_PERMISSIONS: PermissionKey[] = [
  ...new Set([
    PERMISSIONS.dashboardView,
    PERMISSIONS.messagesUse,
    PERMISSIONS.messagesModerate,
    PERMISSIONS.videoCreate,
    PERMISSIONS.videoModerate,
    PERMISSIONS.voiceManage,
    PERMISSIONS.applicationsRead,
    PERMISSIONS.applicationsReview,
    PERMISSIONS.applicationsApprove,
    PERMISSIONS.applicationsReject,
    PERMISSIONS.membersRead,
    PERMISSIONS.membersInvite,
    PERMISSIONS.membersUpdate,
    PERMISSIONS.membersSuspend,
    PERMISSIONS.membersRoleAssign,
    PERMISSIONS.teachersManage,
    PERMISSIONS.eventsCreate,
    PERMISSIONS.eventsUpdate,
    PERMISSIONS.eventsPublish,
    PERMISSIONS.eventsArchive,
    PERMISSIONS.eventsRegistrationsRead,
    PERMISSIONS.announcementsCreate,
    PERMISSIONS.announcementsUpdate,
    PERMISSIONS.announcementsPublish,
    PERMISSIONS.announcementsEmailSend,
    // PRD §5 — Admin's operational override subset. members.create, members.delete,
    // roles.create and video.end_for_all stay exclusively Super Admin.
    PERMISSIONS.announcementsDelete,
    PERMISSIONS.eventsDelete,
    PERMISSIONS.eventsRegistrationsManage,
    PERMISSIONS.auditRead,
    PERMISSIONS.settingsManage,
  ]),
]

export const SYSTEM_ROLES: {
  key: string
  name: string
  description: string
  permissions: PermissionKey[]
}[] = [
  { key: 'visitor', name: 'Visitor', description: 'Public, unauthenticated visitor', permissions: [] },
  { key: 'pending_member', name: 'Pending Member', description: 'Applied, awaiting review', permissions: [] },
  {
    key: 'member',
    name: 'Member',
    description: 'Approved club member',
    permissions: [
      PERMISSIONS.dashboardView,
      PERMISSIONS.messagesUse,
      PERMISSIONS.videoCreate,
    ],
  },
  {
    key: 'club_lead',
    name: 'Club Lead',
    description: 'Team lead; may manage assigned events',
    permissions: CLUB_LEAD_PERMISSIONS,
  },
  {
    key: 'operational_ceo',
    name: 'Operational CEO',
    description: 'Executive leadership; full administrative operations',
    permissions: ADMIN_PERMISSIONS,
  },
  {
    key: 'ceo_training',
    name: 'CEO Training',
    description: 'Executive training lead; leads workshops and programs',
    permissions: CLUB_LEAD_PERMISSIONS,
  },
  {
    key: 'ceo_internship',
    name: 'CEO Internship',
    description: 'Executive internship lead; coordinates student internships',
    permissions: CLUB_LEAD_PERMISSIONS,
  },
  {
    key: 'secretary',
    name: 'Secretary',
    description: 'Club secretary; communications and scheduling lead',
    permissions: CLUB_LEAD_PERMISSIONS,
  },
  {
    key: 'cfo',
    name: 'CFO',
    description: 'Chief Financial Officer; financial oversight and event budgets',
    permissions: CLUB_LEAD_PERMISSIONS,
  },
  {
    key: 'cmo',
    name: 'CMO',
    description: 'Chief Marketing Officer; campaigns and public announcements',
    permissions: CLUB_LEAD_PERMISSIONS,
  },
  {
    key: 'cto_operational',
    name: 'CTO Operational',
    description: 'Chief Technology Officer (Operational); administrative technology systems',
    permissions: ADMIN_PERMISSIONS,
  },
  {
    key: 'cto',
    name: 'CTO',
    description: 'Chief Technology Officer; technical projects lead',
    permissions: CLUB_LEAD_PERMISSIONS,
  },
  {
    key: 'vice_president',
    name: 'Vice President',
    description: 'Vice President; executive club operations and governance',
    permissions: ADMIN_PERMISSIONS,
  },
  {
    key: 'coo',
    name: 'COO',
    description: 'Chief Operating Officer; administrative and operational management',
    permissions: ADMIN_PERMISSIONS,
  },
  {
    key: 'club_president',
    name: 'Club President',
    description: 'Student president; full club operations except system administration',
    permissions: [
      PERMISSIONS.dashboardView,
      PERMISSIONS.messagesUse,
      PERMISSIONS.messagesModerate,
      PERMISSIONS.videoCreate,
      PERMISSIONS.videoModerate,
      PERMISSIONS.voiceManage,
      PERMISSIONS.applicationsRead,
      PERMISSIONS.applicationsReview,
      PERMISSIONS.applicationsApprove,
      PERMISSIONS.applicationsReject,
      PERMISSIONS.membersRead,
      PERMISSIONS.membersInvite,
      PERMISSIONS.membersUpdate,
      PERMISSIONS.teachersManage,
      PERMISSIONS.eventsCreate,
      PERMISSIONS.eventsUpdate,
      PERMISSIONS.eventsPublish,
      PERMISSIONS.eventsArchive,
      PERMISSIONS.eventsRegistrationsRead,
      PERMISSIONS.announcementsCreate,
      PERMISSIONS.announcementsUpdate,
      PERMISSIONS.announcementsPublish,
      PERMISSIONS.announcementsEmailSend,
    ],
  },
  {
    key: 'faculty_advisor',
    name: 'Faculty Advisor',
    description: 'Faculty reviewer; oversight of applications and content',
    permissions: [
      PERMISSIONS.dashboardView,
      PERMISSIONS.messagesUse,
      PERMISSIONS.applicationsRead,
      PERMISSIONS.applicationsReview,
      PERMISSIONS.applicationsApprove,
      PERMISSIONS.applicationsReject,
      PERMISSIONS.membersRead,
      PERMISSIONS.eventsCreate,
      PERMISSIONS.eventsUpdate,
      PERMISSIONS.eventsPublish,
      PERMISSIONS.eventsRegistrationsRead,
      PERMISSIONS.announcementsCreate,
      PERMISSIONS.announcementsUpdate,
      PERMISSIONS.announcementsPublish,
      PERMISSIONS.messagesModerate,
    ],
  },
  {
    key: 'admin',
    name: 'Admin',
    description: 'Administrator; full operations including roles and settings',
    permissions: ADMIN_PERMISSIONS,
  },
  {
    key: 'super_admin',
    name: 'Super Admin',
    description: 'System owner; manages administrative authority itself',
    permissions: [...ALL_PERMISSION_KEYS],
  },
]

export const AUDIENCE_LEVELS: Record<string, number> = {
  public: 0,
  members: 1,
  leads: 2,
}

/**
 * Permissions that can never be bundled into a custom role (PRD §7.3). Custom-role
 * creation rejects these regardless of the caller's grants; role-grant escalation
 * guards (hold-what-you-grant) backstop the same rule at grant time.
 */
export const SUPER_ADMIN_EXCLUSIVE_PERMISSIONS: PermissionKey[] = [
  PERMISSIONS.membersRoleAssign,
  PERMISSIONS.membersPermissionsGrant,
  PERMISSIONS.membersCreate,
  PERMISSIONS.membersDelete,
  PERMISSIONS.auditRead,
  PERMISSIONS.settingsManage,
  PERMISSIONS.rolesCreate,
  PERMISSIONS.videoEndForAll,
]
