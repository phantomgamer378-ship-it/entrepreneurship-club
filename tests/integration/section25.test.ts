// PRD §1.6 / master prompt Section 25 — data-integrity and seed-isolation tests.
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import {
  testDb, seedRbacCatalog, makeActor, cleanupCreatedRows, disconnectTestDb,
} from '../helpers/testdb'

beforeAll(async () => {
  await seedRbacCatalog()
})

afterAll(async () => {
  await cleanupCreatedRows()
  await disconnectTestDb()
})

describe('Section 25.1 — environment guard', () => {
  test('test_runner_refuses_to_run_against_non_test_database', async () => {
    const { assertTestDatabase } = await import('../../src/lib/test-guard')
    // A hosted/remote database URL is never acceptable for tests or seeds.
    expect(() => assertTestDatabase('https://abc123.supabase.co')).toThrow(/not a recognized test database/)
    expect(() => assertTestDatabase('postgresql://user:pass@db.example.com:5432/club')).toThrow(/not a recognized test database/)
    expect(() => assertTestDatabase(null)).toThrow(/not a recognized test database/)
    // Local disposable targets pass.
    expect(() => assertTestDatabase('file:./db/test-suite.db')).not.toThrow()
    expect(() => assertTestDatabase('file::memory:')).not.toThrow()
  })
})

describe('Section 25.2 — public query paths exclude seed data', () => {
  test('public_profiles_view_excludes_seed_data', async () => {
    // One seed-tagged public profile + one normal public profile.
    const { GET } = await import('../../src/app/api/public/team/route')
    const normal = await makeActor({ username: 'itest-public-normal', displayName: 'Public Normal' })
    await testDb.profile.update({ where: { id: normal.profileId }, data: { isPublic: true } })
    const seeded = await makeActor({ username: 'itest-public-seed', displayName: 'Public Seed', isSeedData: true })
    await testDb.profile.update({ where: { id: seeded.profileId }, data: { isPublic: true } })

    const res = await GET(new Request('http://localhost:3000/api/public/team'))
    const body = (await res.json()) as { profiles: { username: string }[] }
    const usernames = body.profiles.map((p) => p.username)
    expect(usernames).not.toContain('itest-public-seed') // seed row invisible
    expect(usernames).toContain('itest-public-normal') // real row visible
  })

  test('public_events_and_announcements_exclude_seed_and_soft_deleted_rows', async () => {
    const { GET: eventsGet } = await import('../../src/app/api/public/events/route')
    await testDb.clubEvent.create({
      data: { title: 'itest Seed Event', slug: `itest-seed-ev-${Date.now()}`, description: 'x'.repeat(20), status: 'published', startsAt: new Date(Date.now() + 864e5), isSeedData: true },
    })
    await testDb.clubEvent.create({
      data: { title: 'itest Deleted Event', slug: `itest-del-ev-${Date.now()}`, description: 'x'.repeat(20), status: 'published', startsAt: new Date(Date.now() + 864e5), deletedAt: new Date() },
    })
    await testDb.clubEvent.create({
      data: { title: 'itest Live Event', slug: `itest-live-ev-${Date.now()}`, description: 'x'.repeat(20), status: 'published', startsAt: new Date(Date.now() + 864e5) },
    })
    const res = await eventsGet(new Request('http://localhost:3000/api/public/events?category=upcoming'))
    const body = (await res.json()) as { events: { title: string }[] }
    const titles = body.events.map((e) => e.title)
    expect(titles).not.toContain('itest Seed Event')
    expect(titles).not.toContain('itest Deleted Event')
    expect(titles).toContain('itest Live Event')
  })

  test('integration_test_cleans_up_its_own_fixture_rows', async () => {
    // §25.4: this suite must leave no fixture rows behind. Create one, clean it, verify.
    const email = 'itest-selfclean@test.local'
    await testDb.memberApplication.create({
      data: { reference: `itest-sc-${Date.now()}`, requestedUsername: 'itest-selfclean', email, fullName: 'Self Clean', motivation: 'x'.repeat(30), status: 'pending' },
    })
    expect(await testDb.memberApplication.count({ where: { email } })).toBe(1)
    await cleanupCreatedRows()
    expect(await testDb.memberApplication.count({ where: { email } })).toBe(0)
  })
})

describe('Section 25.3 — upload contract enforcement', () => {
  test('avatar_path_external_url_rejected_for_non_seed_rows', async () => {
    const { assertMediaContract } = await import('../../src/lib/media')
    // Non-seed row with a raw external stock-photo URL → rejected.
    expect(() => assertMediaContract({ isSeedData: false, avatarUrl: 'https://cdn.stockphotos.example/portrait-42.jpg' }))
      .toThrow(/external URL/)
    // Seed rows may carry placeholders; and allow-listed hosts pass for non-seed rows.
    expect(() => assertMediaContract({ isSeedData: true, avatarUrl: 'https://cdn.stockphotos.example/portrait-42.jpg' })).not.toThrow()
    expect(() => assertMediaContract({ isSeedData: false, avatarUrl: 'https://res.cloudinary.com/club/image/upload/portrait.jpg' })).not.toThrow()
    expect(() => assertMediaContract({ isSeedData: false, avatarUrl: null })).not.toThrow()
    // And the DB is the final backstop at the application write path (wired into
    // profile/event update routes via the same helper).
  })
})
