// Seed script — DEMO/PLACEHOLDER data for development and preview environments.
// ⚠️ NEVER run this against production (§23.11). Production seeding must use real club
// data and rotate the seeded credentials below immediately.
// Run: bun prisma/seed.ts
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/lib/auth/password'
import { SYSTEM_ROLES, ALL_PERMISSION_KEYS } from '../src/lib/rbac/permissions'

const db = new PrismaClient()

const PLACEHOLDER_NOTE = '[PLACEHOLDER CONTENT — replace with official club copy]'

async function main() {
  console.log('Seeding roles & permissions…')
  for (const p of ALL_PERMISSION_KEYS) {
    await db.permission.upsert({
      where: { key: p },
      update: {},
      create: { key: p, description: p, isSystem: true },
    })
  }
  const roleMap = new Map<string, string>()
  for (const role of SYSTEM_ROLES) {
    const r = await db.role.upsert({
      where: { key: role.key },
      update: { name: role.name, description: role.description },
      create: { key: role.key, name: role.name, description: role.description, isSystem: true },
    })
    roleMap.set(role.key, r.id)
    for (const permKey of role.permissions) {
      const perm = await db.permission.findUnique({ where: { key: permKey } })
      if (!perm) continue
      await db.rolePermission.upsert({
        where: { roleId_permissionId_scope: { roleId: r.id, permissionId: perm.id, scope: '*' } },
        update: {},
        create: { roleId: r.id, permissionId: perm.id, scope: '*', grantedBy: 'seed' },
      })
    }
  }

  console.log('Seeding demo users (PLACEHOLDER — rotate credentials before any real use)…')
  const demoPassword = await hashPassword('ClubDemo#2024')

  const demoUsers: {
    email: string
    fullName: string
    roleKey: string
    username: string
    displayName: string
    bio: string
    clubRoleLabel: string
    isPublic: boolean
    linkedinUrl?: string
    githubUrl?: string
    achievements?: string[]
  }[] = [
    {
      email: 'superadmin@club.adypu.edu.in',
      fullName: 'Platform Super Admin',
      roleKey: 'super_admin',
      username: 'superadmin',
      displayName: 'Platform Admin',
      bio: 'Maintains the club platform.',
      clubRoleLabel: 'Super Admin',
      isPublic: false,
    },
    {
      email: 'president@club.adypu.edu.in',
      fullName: 'Aarav Sharma',
      roleKey: 'club_president',
      username: 'aarav.sharma',
      displayName: 'Aarav Sharma',
      bio: 'Third-year B.Tech. Leading the club’s 2026 roadmap, partnerships and flagship events.',
      clubRoleLabel: 'President',
      isPublic: true,
      linkedinUrl: 'https://www.linkedin.com/',
      achievements: JSON.parse(JSON.stringify(['Led Pitch Day 2025 (300+ attendees)', 'Built 12 industry partnerships'])),
    },
    {
      email: 'advisor@club.adypu.edu.in',
      fullName: 'Dr. Meera Iyer',
      roleKey: 'faculty_advisor',
      username: 'meera.iyer',
      displayName: 'Dr. Meera Iyer',
      bio: 'Faculty advisor at ALTA School of Technology. Mentor for student ventures and application reviews.',
      clubRoleLabel: 'Faculty Advisor',
      isPublic: true,
    },
    {
      email: 'lead.events@club.adypu.edu.in',
      fullName: 'Priya Nair',
      roleKey: 'club_lead',
      username: 'priya.nair',
      displayName: 'Priya Nair',
      bio: 'Events lead. Organises workshops, hackathons and the founder talk series.',
      clubRoleLabel: 'Events Lead',
      isPublic: true,
      githubUrl: 'https://github.com/',
      achievements: JSON.parse(JSON.stringify(['Ran 8 workshops in 2025'])),
    },
    {
      email: 'member@club.adypu.edu.in',
      fullName: 'Rohan Verma',
      roleKey: 'member',
      username: 'rohan.verma',
      displayName: 'Rohan Verma',
      bio: 'Second-year member interested in product and startup ops.',
      clubRoleLabel: 'Member',
      isPublic: true,
    },
    {
      email: 'member2@club.adypu.edu.in',
      fullName: 'Sara Khan',
      roleKey: 'member',
      username: 'sara.khan',
      displayName: 'Sara Khan',
      bio: 'First-year member exploring fintech ideas.',
      clubRoleLabel: 'Member',
      isPublic: true,
    },
  ]

  const userIds = new Map<string, string>()
  for (const u of demoUsers) {
    const user = await db.user.upsert({
      where: { email: u.email },
      update: { isActive: true },
      create: {
        email: u.email,
        fullName: u.fullName,
        passwordHash: demoPassword,
        isActive: true,
        profile: {
          create: {
            username: u.username,
            displayName: u.displayName,
            bio: `${u.bio} ${PLACEHOLDER_NOTE}`,
            clubRoleLabel: u.clubRoleLabel,
            isPublic: u.isPublic,
            linkedinUrl: u.linkedinUrl,
            githubUrl: u.githubUrl,
            achievements: u.achievements ? JSON.stringify(u.achievements) : null,
            interests: JSON.stringify(['startups', 'innovation']),
            isSeedData: true, // Section 25.2 — demo rows are invisible on public pages
          },
        },
        emailPreference: { create: {} },
      },
    })
    userIds.set(u.email, user.id)
    const roleId = roleMap.get(u.roleKey)!
    await db.userRole.upsert({
      where: { userId_roleId_scope: { userId: user.id, roleId, scope: '*' } },
      update: {},
      create: { userId: user.id, roleId, scope: '*', assignedBy: 'seed' },
    })
  }

  const presidentId = userIds.get('president@club.adypu.edu.in')!
  const advisorId = userIds.get('advisor@club.adypu.edu.in')!
  const memberId = userIds.get('member@club.adypu.edu.in')!
  const member2Id = userIds.get('member2@club.adypu.edu.in')!
  const leadId = userIds.get('lead.events@club.adypu.edu.in')!

  console.log('Seeding demo applications…')
  const demoApps = [
    {
      requestedUsername: 'arjun.mehta',
      email: 'arjun.mehta@example.com',
      fullName: 'Arjun Mehta',
      courseYear: 'B.Tech CSE, 2nd Year',
      interestArea: 'Product & UX',
      motivation:
        'I have been building side projects since school and want to learn how real startups validate ideas. I am looking for a community where I can contribute to events and learn from founders.',
      status: 'pending',
    },
    {
      requestedUsername: 'neha.joshi',
      // Reserved demo domain (RFC 2606) — fixture applications must never target a
      // mailbox that could belong to a real person, even if a decision is re-run.
      email: 'neha.joshi@example.com',
      fullName: 'Neha Joshi',
      courseYear: 'BBA, 1st Year',
      interestArea: 'Marketing',
      motivation:
        'I run a small Instagram page with 5k followers and want to apply those skills to promote club events. I am eager to join the marketing team and grow the club’s reach on campus.',
      status: 'pending',
    },
  ]
  for (const a of demoApps) {
    const exists = await db.memberApplication.findUnique({ where: { reference: `${a.requestedUsername}-demo` } })
    if (!exists) {
      await db.memberApplication.create({
        data: { ...a, reference: `${a.requestedUsername}-demo` },
      })
    }
  }

  console.log('Seeding demo events…')
  const now = Date.now()
  const events = [
    {
      slug: 'founder-talk-2026',
      title: 'Founder Talks: Building in Pune',
      summary: 'An evening with three Pune-based founders on zero-to-one journeys.',
      description:
        'Join us for the first Founder Talks of the year. Three founders from Pune’s startup ecosystem share how they went from idea to first customers, followed by an open Q&A and networking over chai. [PLACEHOLDER CONTENT]',
      venue: 'ALTA Auditorium, ADYPU Lohegaon Campus',
      startsAt: new Date(now + 14 * 864e5),
      endsAt: new Date(now + 14 * 864e5 + 3 * 3600e3),
      capacity: 200,
      status: 'published',
      featured: true,
    },
    {
      slug: 'pitch-workshop-2026',
      title: 'Pitch Craft Workshop',
      summary: 'Hands-on workshop: structure a 3-minute investor pitch.',
      description:
        'Bring your idea (or borrow one of ours) and leave with a structured 3-minute pitch. Mentors from the faculty and senior members will workshop storytelling, numbers and delivery. [PLACEHOLDER CONTENT]',
      venue: 'Innovation Lab, Block C',
      startsAt: new Date(now + 30 * 864e5),
      capacity: 60,
      status: 'published',
    },
    {
      slug: 'pitch-day-2025',
      title: 'Pitch Day 2025',
      summary: 'Our flagship annual pitch competition — 12 teams, 3 winners.',
      description:
        'Twelve student teams pitched to a panel of investors and founders. Winning teams took home seed support and incubation offers. [PLACEHOLDER CONTENT — replace with official recap]',
      venue: 'Main Auditorium',
      startsAt: new Date(now - 120 * 864e5),
      endsAt: new Date(now - 120 * 864e5 + 5 * 3600e3),
      status: 'published',
      recap:
        '300+ attendees, 12 teams pitched, ₹50k in prizes awarded. Winners: Team AgroSense, Team PayGully, Team CampusCart. [PLACEHOLDER]',
    },
  ]
  for (const e of events) {
    await db.clubEvent.upsert({
      where: { slug: e.slug },
      update: {},
      create: {
        ...e,
        createdById: leadId,
        isSeedData: true, // Section 25.2
        registrationDeadline: e.startsAt > new Date(now) ? new Date(e.startsAt.getTime() - 864e5) : undefined,
      } as never,
    })
  }

  console.log('Seeding demo announcements…')
  const announcements = [
    {
      slug: 'welcome-intake-2026',
      title: 'Membership applications open for 2026 intake',
      body:
        'We are now accepting applications for the 2026 cohort. If you are curious about startups, product, design, or just want to build things with ambitious people — apply through the Join page. Applications are reviewed weekly by the core team and faculty advisors. [PLACEHOLDER CONTENT]',
      category: 'general',
      audience: 'public',
      status: 'published',
      pinned: true,
    },
    {
      slug: 'ecx-demo-day-recap',
      title: 'ECX Demo Day recap: 400 attendees, 9 demos',
      body:
        'Thank you to everyone who made ECX Demo Day a success. Nine student demos, four partner companies and one very loud applause for Team CampusCart. Full gallery coming soon. [PLACEHOLDER CONTENT]',
      category: 'event',
      audience: 'public',
      status: 'published',
    },
    {
      slug: 'members-mentorship-2026',
      title: '[Members] Mentorship circle signups close Friday',
      body:
        'Members-only: signup for the spring mentorship circle closes this Friday. Twelve mentors from our advisor network are participating. Reply in the #announcements conversation with your preference. [PLACEHOLDER CONTENT]',
      category: 'opportunity',
      audience: 'members',
      status: 'published',
    },
  ]
  for (const a of announcements) {
    await db.announcement.upsert({
      where: { slug: a.slug },
      update: {},
      create: { ...a, publishedAt: new Date(now - 3 * 864e5), createdById: presidentId, isSeedData: true },
    })
  }

  // Section 25.2 — tag legacy seed rows created before the isSeedData column existed,
  // so re-running the seed on an older dev database also brings it into compliance.
  const tagged = await db.$transaction([
    db.profile.updateMany({ where: { isSeedData: false, username: { in: ['superadmin', 'aarav.sharma', 'meera.iyer', 'priya.nair', 'rohan.verma', 'sara.khan'] } }, data: { isSeedData: true } }),
    db.clubEvent.updateMany({ where: { isSeedData: false, slug: { in: events.map((e) => e.slug) } }, data: { isSeedData: true } }),
    db.announcement.updateMany({ where: { isSeedData: false, slug: { in: announcements.map((a) => a.slug) } }, data: { isSeedData: true } }),
  ])
  console.log(`Section 25 tagging: profiles=${tagged[0].count} events=${tagged[1].count} announcements=${tagged[2].count}`)

  console.log('Seeding demo conversation…')
  const convExists = await db.conversation.findFirst({ where: { type: 'group', name: 'General — Members Lounge' } })
  if (!convExists) {
    const conv = await db.conversation.create({
      data: {
        type: 'group',
        name: 'General — Members Lounge',
        createdById: presidentId,
        members: {
          create: [
            { userId: presidentId, memberRole: 'moderator' },
            { userId: leadId },
            { userId: memberId },
            { userId: member2Id },
            { userId: advisorId },
          ],
        },
      },
    })
    await db.message.createMany({
      data: [
        { conversationId: conv.id, senderId: presidentId, body: 'Welcome to the members lounge! 👋 Drop an intro when you get a chance.' },
        { conversationId: conv.id, senderId: leadId, body: 'Events plan for this month is up — founder talks in two weeks.' },
        { conversationId: conv.id, senderId: memberId, body: 'Excited! Can I help with registration desks?' },
      ],
    })
    await db.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: new Date() } })
  }

  console.log('Seeding club settings…')
  const settings: [string, unknown][] = [
    ['club.tagline', 'Build. Learn. Launch.'],
    ['club.mission', 'A student-led community at ALTA School of Technology that turns curious students into founders. [PLACEHOLDER]'],
    ['club.vision', 'Every student with an idea finds the people, skills and confidence to pursue it. [PLACEHOLDER]'],
    ['contact.email', 'hello@club.adypu.edu.in'],
    ['social.instagram', 'https://instagram.com/'],
    ['social.linkedin', 'https://www.linkedin.com/'],
    ['membership.seats', 120],
    ['email.announcementEnabled', true],
  ]
  for (const [key, value] of settings) {
    await db.clubSetting.upsert({
      where: { key },
      update: {},
      create: { key, value: JSON.stringify(value), updatedBy: 'seed' },
    })
  }

  console.log('Seeding default voice channels…')
  const voiceChannels: { slug: string; name: string; topic: string }[] = [
    { slug: 'ec-voice-general-lounge', name: 'General Lounge', topic: 'Hang out and talk about anything' },
    { slug: 'ec-voice-build-desk', name: 'Build Desk', topic: 'Pairing, project help and demos' },
    { slug: 'ec-voice-chill-zone', name: 'Chill Zone', topic: 'Lo-fi, games and unwinding' },
  ]
  for (const c of voiceChannels) {
    await db.voiceChannel.upsert({
      where: { slug: c.slug },
      update: { name: c.name, topic: c.topic },
      create: { slug: c.slug, name: c.name, topic: c.topic, createdById: null },
    })
  }

  console.log('✅ Seed complete. Demo credentials (ALL users): ClubDemo#2024')
  console.log('   superadmin@club.adypu.edu.in · president@club.adypu.edu.in · advisor@club.adypu.edu.in · lead.events@club.adypu.edu.in · member@club.adypu.edu.in')
}

/** Awaitable entrypoint so guarded wrappers (scripts/seed-demo-data.ts) can wait for completion. */
export async function runSeed(): Promise<void> {
  try {
    await main()
  } catch (e) {
    console.error(e)
    process.exitCode = 1
  } finally {
    await db.$disconnect()
  }
}

if (import.meta.main) {
  void runSeed()
}
