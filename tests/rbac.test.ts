// RBAC core tests — the pure authorization matcher used by every API route.
// These encode §8/§21 requirements: deny by default, scope matching,
// resource-scoped grants, and the shape of the seeded role catalog.
import { describe, test, expect } from 'bun:test'
import { canWithGrants, scopeMatches, ROLE_KEYS, type Grant } from '../src/lib/rbac/authorize'
import { PERMISSIONS, SYSTEM_ROLES, ALL_PERMISSION_KEYS } from '../src/lib/rbac/permissions'

const g = (key: string, scope = '*'): Grant => ({ key, scope })

describe('scopeMatches', () => {
  test('global wildcard matches everything', () => {
    expect(scopeMatches('*', { type: 'event', id: 'e1' })).toBe(true)
    expect(scopeMatches('*', undefined)).toBe(true)
  })
  test('resource scope matches only its own id', () => {
    expect(scopeMatches('event:e1', { type: 'event', id: 'e1' })).toBe(true)
    expect(scopeMatches('event:e1', { type: 'event', id: 'e2' })).toBe(false)
  })
  test('resource scope does not leak across resource types', () => {
    expect(scopeMatches('event:e1', { type: 'announcement', id: 'e1' })).toBe(false)
  })
  test('type-wide scope matches any id of the type', () => {
    expect(scopeMatches('event:*', { type: 'event', id: 'whatever' })).toBe(true)
  })
  test('no resource context → scoped grants never match', () => {
    expect(scopeMatches('event:e1')).toBe(false)
  })
})

describe('canWithGrants (deny by default)', () => {
  test('no grants → nothing allowed', () => {
    expect(canWithGrants([], PERMISSIONS.applicationsApprove)).toBe(false)
    expect(canWithGrants([], PERMISSIONS.messagesUse, { type: 'conversation', id: 'c1' })).toBe(false)
  })
  test('grants a permission the user does not hold → denied', () => {
    const grants = [g(PERMISSIONS.eventsUpdate)]
    expect(canWithGrants(grants, PERMISSIONS.applicationsApprove)).toBe(false)
  })
  test('holds the permission globally → allowed with and without resource', () => {
    const grants = [g(PERMISSIONS.applicationsApprove)]
    expect(canWithGrants(grants, PERMISSIONS.applicationsApprove)).toBe(true)
    expect(canWithGrants(grants, PERMISSIONS.applicationsApprove, { type: 'application', id: 'a1' })).toBe(true)
  })
  test('resource-scoped grant allows only that resource (Event Lead case)', () => {
    const eventLead: Grant[] = [g(PERMISSIONS.eventsUpdate, 'event:evt_42')]
    expect(canWithGrants(eventLead, PERMISSIONS.eventsUpdate, { type: 'event', id: 'evt_42' })).toBe(true)
    expect(canWithGrants(eventLead, PERMISSIONS.eventsUpdate, { type: 'event', id: 'evt_43' })).toBe(false)
    expect(canWithGrants(eventLead, PERMISSIONS.eventsUpdate)).toBe(false)
  })
  test('scoped grant does not confer sibling permissions', () => {
    const lead: Grant[] = [g(PERMISSIONS.eventsUpdate, 'event:evt_42')]
    expect(canWithGrants(lead, PERMISSIONS.eventsPublish, { type: 'event', id: 'evt_42' })).toBe(false)
    expect(canWithGrants(lead, PERMISSIONS.membersSuspend, { type: 'event', id: 'evt_42' })).toBe(false)
  })
})

describe('role catalog invariants', () => {
  test('all eight system roles exist with the mandated keys', () => {
    const keys = SYSTEM_ROLES.map((r) => r.key)
    expect(keys).toEqual([
      'visitor', 'pending_member', 'member', 'club_lead', 'club_president',
      'faculty_advisor', 'admin', 'super_admin',
    ])
    expect(ROLE_KEYS.superAdmin).toBe('super_admin')
  })
  test('visitor and pending member hold no permissions', () => {
    for (const role of SYSTEM_ROLES.filter((r) => ['visitor', 'pending_member'].includes(r.key))) {
      expect(role.permissions).toEqual([])
    }
  })
  test('super_admin holds every permission in the catalog', () => {
    const superAdmin = SYSTEM_ROLES.find((r) => r.key === 'super_admin')!
    expect(new Set(superAdmin.permissions).size).toBe(ALL_PERMISSION_KEYS.length)
    for (const p of ALL_PERMISSION_KEYS) {
      expect(superAdmin.permissions).toContain(p)
    }
  })
  test('member can message and create video rooms but cannot administer', () => {
    const member = SYSTEM_ROLES.find((r) => r.key === 'member')!
    expect(member.permissions).toContain(PERMISSIONS.messagesUse)
    expect(member.permissions).toContain(PERMISSIONS.videoCreate)
    expect(member.permissions).not.toContain(PERMISSIONS.applicationsReview)
    expect(member.permissions).not.toContain(PERMISSIONS.membersSuspend)
    expect(member.permissions).not.toContain(PERMISSIONS.settingsManage)
  })
  test('faculty advisor reviews applications but cannot grant permissions or manage roles', () => {
    const advisor = SYSTEM_ROLES.find((r) => r.key === 'faculty_advisor')!
    expect(advisor.permissions).toContain(PERMISSIONS.applicationsApprove)
    expect(advisor.permissions).not.toContain(PERMISSIONS.membersPermissionsGrant)
    expect(advisor.permissions).not.toContain(PERMISSIONS.membersRoleAssign)
  })
  test('club lead manages events/announcements but not members', () => {
    const lead = SYSTEM_ROLES.find((r) => r.key === 'club_lead')!
    expect(lead.permissions).toContain(PERMISSIONS.eventsCreate)
    expect(lead.permissions).not.toContain(PERMISSIONS.membersInvite)
    expect(lead.permissions).not.toContain(PERMISSIONS.membersSuspend)
  })
})
