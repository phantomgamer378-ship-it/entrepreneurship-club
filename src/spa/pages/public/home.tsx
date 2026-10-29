'use client'

// Homepage (§5.1): hero (scroll-driven pixel dither bg), mission, impact stats,
// leadership preview, upcoming events, past highlights, public announcements,
// membership CTA + public event registration entry, walking-peeps crowd strip
// above the footer (Skiper 39 canvas + GSAP).
import { useQuery } from '@tanstack/react-query'
import { motion, usePrefersReducedMotion } from '@/spa/lib/motion'
import { PixelDitherHero } from '@/features/landing/PixelDitherHero'
import { CrowdCanvas } from '@/components/ui/skiper39'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowRight, CalendarDays, MapPin, Megaphone, Sparkles, Users, Rocket, GraduationCap } from 'lucide-react'
import { api } from '@/spa/api/client'
import { navigate } from '@/spa/router'
import { PageHeader, EmptyState, formatDate } from '@/spa/components/shared'

type Stats = { members: number; events: number; announcements: number; applications: number }
type EventCard = {
  slug: string; title: string; summary: string | null; venue: string | null
  startsAt: string; seatsLeft: number | null; registrationCount: number; isPast: boolean; featured: boolean
}
type TeamCard = { username: string; displayName: string; clubRoleLabel: string | null; bio: string | null; avatarUrl: string | null }
type AnnouncementCard = { id: string; title: string; category: string; pinned: boolean; publishedAt: string | null; excerpt: string }

export default function HomePage() {
  const reduce = usePrefersReducedMotion()
  const { data: stats } = useQuery({ queryKey: ['public-stats'], queryFn: () => api.get<Stats>('/api/public/stats') })
  const { data: events } = useQuery({
    queryKey: ['home-events'],
    queryFn: () => api.get<{ events: EventCard[] }>('/api/public/events?category=upcoming&pageSize=3'),
  })
  const { data: past } = useQuery({
    queryKey: ['home-past'],
    queryFn: () => api.get<{ events: EventCard[] }>('/api/public/events?category=past&pageSize=2'),
  })
  const { data: team } = useQuery({
    queryKey: ['home-team'],
    queryFn: () => api.get<{ profiles: TeamCard[] }>('/api/public/team?pageSize=4'),
  })
  const { data: announcements } = useQuery({
    queryKey: ['home-announcements'],
    queryFn: () => api.get<{ announcements: AnnouncementCard[] }>('/api/public/announcements?pageSize=3'),
  })

  const fadeUp = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 24 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: '-60px' },
        transition: { duration: 0.5 },
      }

  return (
    <div>
      {/* Hero — scroll-driven Bayer-dither morph (cloud → mark → arrow) behind the copy. */}
      <PixelDitherHero>
        <motion.div {...(reduce ? {} : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5 } })}>
          <Badge variant="secondary" className="mb-4 gap-1">
            <Sparkles className="h-3 w-3" aria-hidden /> ALTA School of Technology · ADYPU, Pune
          </Badge>
          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
            Where student ideas become <span className="text-primary">startups</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
            The Entrepreneurship Club is a student-led community for builders — pitch nights, founder talks,
            workshops and a network of mentors. Join us to learn, build and launch.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" onClick={() => navigate('/join')}>
              Become a member <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate('/events')}>
              Explore events <CalendarDays className="ml-1 h-4 w-4" aria-hidden />
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">[PLACEHOLDER HERO COPY — replace with official club messaging]</p>
        </motion.div>
      </PixelDitherHero>

      {/* Mission & vision */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-6 md:grid-cols-2">
          <motion.div {...fadeUp}>
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Rocket className="h-5 w-5 text-primary" aria-hidden /> Our Mission</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-relaxed text-muted-foreground">
                To give every student with an idea the people, skills and confidence to pursue it — through hands-on
                events, mentorship and a community that celebrates building. [PLACEHOLDER CONTENT — replace via
                Admin → Settings]
              </CardContent>
            </Card>
          </motion.div>
          <motion.div {...fadeUp}>
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><GraduationCap className="h-5 w-5 text-primary" aria-hidden /> Our Vision</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-relaxed text-muted-foreground">
                A campus where entrepreneurship is a habit, not a hashtag — where students graduate having shipped
                something real. [PLACEHOLDER CONTENT — replace via Admin → Settings]
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Impact stats */}
      <section className="border-y bg-muted/40">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-12 sm:grid-cols-4">
          {[
            { label: 'Public members', value: stats?.members ?? <Skeleton className="h-8 w-16" />, icon: Users },
            { label: 'Events hosted', value: stats?.events ?? <Skeleton className="h-8 w-16" />, icon: CalendarDays },
            { label: 'Announcements', value: stats?.announcements ?? <Skeleton className="h-8 w-16" />, icon: Megaphone },
            { label: 'Founded', value: stats ? '2026' : <Skeleton className="h-8 w-10" />, icon: Sparkles },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              {...(reduce ? {} : { initial: { opacity: 0, y: 14 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { delay: i * 0.07, duration: 0.4 } })}
              className="text-center"
            >
              <s.icon className="mx-auto mb-2 h-5 w-5 text-primary" aria-hidden />
              <div className="text-3xl font-extrabold tabular-nums">{s.value}</div>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.label}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Leadership preview */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <PageHeader
          title="Leadership & team"
          description="The students and faculty driving the club forward."
          actions={<Button variant="outline" onClick={() => navigate('/team')}>View full team <ArrowRight className="ml-1 h-4 w-4" aria-hidden /></Button>}
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(team?.profiles ?? []).map((p, i) => (
            <motion.div
              key={p.username}
              {...(reduce ? {} : { initial: { opacity: 0, y: 16 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { delay: i * 0.06, duration: 0.4 } })}
            >
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <MemberAvatar name={p.displayName} url={p.avatarUrl} />
                    <div className="min-w-0">
                      <button onClick={() => navigate(`/members/${p.username}`)} className="block truncate text-sm font-semibold hover:underline">
                        {p.displayName}
                      </button>
                      <p className="truncate text-xs text-primary">{p.clubRoleLabel ?? 'Member'}</p>
                    </div>
                  </div>
                  {p.bio ? <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{p.bio}</p> : null}
                </CardContent>
              </Card>
            </motion.div>
          ))}
          {!team ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />) : null}
        </div>
      </section>

      {/* Upcoming events with registration entry */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <PageHeader
            title="Upcoming events"
            description="Register right from the event page — open to members and guests."
            actions={<Button variant="outline" onClick={() => navigate('/events')}>All events <ArrowRight className="ml-1 h-4 w-4" aria-hidden /></Button>}
          />
          {events?.events.length ? (
            <div className="grid gap-4 md:grid-cols-3">
              {events.events.map((e, i) => (
                <motion.div
                  key={e.slug}
                  {...(reduce ? {} : { initial: { opacity: 0, y: 16 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { delay: i * 0.07, duration: 0.4 } })}
                >
                  <EventTile event={e} />
                </motion.div>
              ))}
            </div>
          ) : (
            <EmptyState title="No upcoming events yet" description="Check back soon — or browse past events." action={<Button variant="outline" onClick={() => navigate('/events?category=past')}>Past events</Button>} />
          )}
        </div>
      </section>

      {/* Past highlights */}
      {past?.events.length ? (
        <section className="mx-auto max-w-6xl px-4 py-16">
          <PageHeader title="Past event highlights" description="A look at what we have already built together." />
          <div className="grid gap-4 md:grid-cols-2">
            {past.events.map((e, i) => (
              <motion.div
                key={e.slug}
                {...(reduce ? {} : { initial: { opacity: 0, y: 16 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { delay: i * 0.07, duration: 0.4 } })}
              >
                <EventTile event={e} past />
              </motion.div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Announcements */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <PageHeader
            title="Latest announcements"
            actions={<Button variant="outline" onClick={() => navigate('/announcements')}>All announcements <ArrowRight className="ml-1 h-4 w-4" aria-hidden /></Button>}
          />
          {announcements?.announcements.length ? (
            <div className="grid gap-4 md:grid-cols-3">
              {announcements.announcements.map((a, i) => (
                <motion.div
                  key={a.id}
                  {...(reduce ? {} : { initial: { opacity: 0, y: 16 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { delay: i * 0.06, duration: 0.4 } })}
                >
                  <Card className="h-full transition-shadow hover:shadow-md">
                    <CardContent className="p-5">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="capitalize">{a.category}</Badge>
                        {a.pinned ? <Badge className="bg-primary">Pinned</Badge> : null}
                      </div>
                      <button onClick={() => navigate(`/announcements/${a.id}`)} className="mt-3 block text-left text-sm font-semibold hover:underline">
                        {a.title}
                      </button>
                      <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{a.excerpt}</p>
                      <p className="mt-3 text-xs text-muted-foreground/70">{formatDate(a.publishedAt, false)}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          ) : (
            <EmptyState title="No announcements yet" />
          )}
        </div>
      </section>

      {/* Join CTA */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <motion.div
          {...(reduce ? {} : { initial: { opacity: 0, scale: 0.98 }, whileInView: { opacity: 1, scale: 1 }, viewport: { once: true }, transition: { duration: 0.5 } })}
          className="rounded-3xl bg-zinc-950 px-6 py-14 text-center text-zinc-50"
        >
          <h2 className="text-3xl font-extrabold sm:text-4xl">Ready to build with us?</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-400">
            Applications for the 2026 intake are open. Tell us what you want to build — we review weekly.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" onClick={() => navigate('/join')}>Apply for membership</Button>
            <Button size="lg" variant="outline" className="border-zinc-700 bg-transparent text-zinc-100 hover:bg-zinc-900 hover:text-zinc-50" onClick={() => navigate('/about')}>
              Learn about the club
            </Button>
          </div>
        </motion.div>
      </section>

      {/* Crowd strip — walking-peeps canvas (Skiper 39) sitting right above the footer.
          Light background in day mode, near-black at night; the canvas inverts in dark
          mode so the black-ink peeps become white ink and stay visible. */}
      <section
        aria-label="Join the crowd"
        className="relative h-[340px] overflow-hidden border-t bg-white text-zinc-950 sm:h-[420px] dark:bg-zinc-950 dark:text-zinc-100"
      >
        <div className="absolute left-1/2 top-10 z-10 grid -translate-x-1/2 content-start justify-items-center gap-6 text-center sm:top-14">
          <span className="relative max-w-[20ch] text-xs uppercase leading-tight tracking-[0.2em] text-zinc-950/50 after:absolute after:left-1/2 after:top-full after:h-16 after:w-px after:bg-gradient-to-b after:from-transparent after:to-zinc-950/60 after:content-[''] dark:text-zinc-100/50 after:dark:to-zinc-100/60">
            Join the crowd — builders walk together
          </span>
        </div>
        <CrowdCanvas src="/peeps.png" rows={15} cols={7} scale={0.5} className="absolute bottom-0 left-0 h-full w-full dark:invert" />
      </section>
    </div>
  )
}

function EventTile({ event, past = false }: { event: EventCard; past?: boolean }) {
  return (
    <Card className="flex h-full flex-col transition-shadow hover:shadow-md">
      <CardContent className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-2">
          {event.featured ? <Badge className="bg-primary">Featured</Badge> : null}
          {past ? <Badge variant="secondary">Past event</Badge> : null}
        </div>
        <button onClick={() => navigate(`/events/${event.slug}`)} className="mt-3 text-left text-base font-semibold leading-snug hover:underline">
          {event.title}
        </button>
        {event.summary ? <p className="mt-2 line-clamp-2 flex-1 text-xs text-muted-foreground">{event.summary}</p> : <div className="flex-1" />}
        <div className="mt-4 space-y-1 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" aria-hidden /> {formatDate(event.startsAt)}</p>
          {event.venue ? <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" aria-hidden /> {event.venue}</p> : null}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {event.registrationCount} registered{event.seatsLeft !== null ? ` · ${event.seatsLeft} seats left` : ''}
          </span>
          <Button size="sm" variant={past ? 'outline' : 'default'} onClick={() => navigate(`/events/${event.slug}`)}>
            {past ? 'View recap' : 'Register'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function MemberAvatar({ name, url }: { name: string; url: string | null }) {
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  return url ? (
     
    <img src={url} alt={`${name}'s avatar`} className="h-10 w-10 rounded-full object-cover" />
  ) : (
    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary" aria-hidden>
      {initials}
    </span>
  )
}
