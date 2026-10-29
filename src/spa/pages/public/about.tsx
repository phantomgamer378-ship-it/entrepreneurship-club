'use client'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/spa/components/shared'
import { api } from '@/spa/api/client'
import { navigate } from '@/spa/router'
import { Button } from '@/components/ui/button'
import { Rocket, Target, Compass, HandHeart } from 'lucide-react'

type Stats = { members: number; events: number }
type TeamCard = { username: string; displayName: string; clubRoleLabel: string | null }

export default function AboutPage() {
  const { data: stats } = useQuery({ queryKey: ['public-stats'], queryFn: () => api.get<Stats>('/api/public/stats') })
  const { data: team } = useQuery({
    queryKey: ['about-team'],
    queryFn: () => api.get<{ profiles: TeamCard[] }>('/api/public/team?pageSize=8'),
  })

  return (
    <div className="mx-auto max-w-4xl px-4 py-14">
      <PageHeader
        title="About the Club"
        description="Entrepreneurship Club — ALTA School of Technology, Ajeenkya DY Patil University, Pune."
      />

      <div className="prose-sm space-y-8">
        <section>
          <h2 className="flex items-center gap-2 text-xl font-bold"><Rocket className="h-5 w-5 text-primary" aria-hidden /> Who we are</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            We are a student-led community at ALTA School of Technology that exists to turn curious students into
            builders. Our members come from every discipline — engineering, business, design and law — and share one
            thing: the itch to make something real. Through weekly meetups, founder talks, pitch nights and hands-on
            workshops, we practice the entrepreneurial craft together rather than only reading about it.
            [PLACEHOLDER CONTENT — replace with official club introduction via Admin → Settings]
          </p>
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Target className="h-4 w-4 text-primary" aria-hidden /> Mission</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Give every student with an idea the people, skills and confidence to pursue it. [PLACEHOLDER]
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Compass className="h-4 w-4 text-primary" aria-hidden /> Vision</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              A campus where entrepreneurship is a habit — every student graduates having shipped something real. [PLACEHOLDER]
            </CardContent>
          </Card>
        </div>

        <section>
          <h2 className="flex items-center gap-2 text-xl font-bold"><HandHeart className="h-5 w-5 text-primary" aria-hidden /> What we do</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li><strong className="text-foreground">Founder Talks</strong> — intimate sessions with founders from Pune and beyond. [PLACEHOLDER]</li>
            <li><strong className="text-foreground">Pitch Days</strong> — term pitch competitions with investor panels and seed support.</li>
            <li><strong className="text-foreground">Skill Workshops</strong> — validation, prototyping, finance, storytelling.</li>
            <li><strong className="text-foreground">Mentorship Circles</strong> — small groups matched with alumni and faculty mentors.</li>
            <li><strong className="text-foreground">Community</strong> — a member workspace for messages, meetings and announcements.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold">Impact at a glance</h2>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <Card><CardContent className="p-4 text-center"><p className="text-2xl font-extrabold">{stats?.members ?? '—'}</p><p className="text-xs text-muted-foreground">Public members</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-2xl font-extrabold">{stats?.events ?? '—'}</p><p className="text-xs text-muted-foreground">Events hosted</p></CardContent></Card>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">[PLACEHOLDER STATISTICS — connect official numbers]</p>
        </section>

        <section>
          <h2 className="text-xl font-bold">The team behind it</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {(team?.profiles ?? []).map((p) => (
              <Button key={p.username} variant="outline" size="sm" onClick={() => navigate(`/members/${p.username}`)}>
                {p.displayName}{p.clubRoleLabel ? <span className="ml-1.5 text-xs text-muted-foreground">· {p.clubRoleLabel}</span> : null}
              </Button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border bg-muted/40 p-6 text-center">
          <h2 className="text-lg font-bold">Want in?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Membership applications are reviewed weekly by the core team and faculty advisors.
          </p>
          <Button className="mt-4" onClick={() => navigate('/join')}>Apply now</Button>
        </section>
      </div>
    </div>
  )
}
