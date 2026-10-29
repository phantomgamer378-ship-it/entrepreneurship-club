'use client'

// Resources page (§5.1 nav) — curated startup resources for students.
// Content is placeholder until the club supplies official material.
import { PageHeader } from '@/spa/components/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BookOpen, HandCoins, Users2, Wrench } from 'lucide-react'

const SECTIONS = [
  {
    icon: BookOpen,
    title: 'Learn the basics',
    items: [
      'Validation 101 — how to test demand before building [PLACEHOLDER]',
      'Startup finance for students: unit costs & runway [PLACEHOLDER]',
      'Storytelling for pitches [PLACEHOLDER]',
    ],
  },
  {
    icon: Wrench,
    title: 'Build & prototype',
    items: [
      'No-code tooling starter kit [PLACEHOLDER]',
      'MVP in a weekend — templates [PLACEHOLDER]',
      'Design systems on a student budget [PLACEHOLDER]',
    ],
  },
  {
    icon: HandCoins,
    title: 'Funding & support',
    items: [
      'ADYPU incubation cell — intake process [PLACEHOLDER]',
      'State & national student startup grants [PLACEHOLDER]',
      'Pitch-day prizes and seed support [PLACEHOLDER]',
    ],
  },
  {
    icon: Users2,
    title: 'Community & mentors',
    items: [
      'Mentorship circle — how to get matched [PLACEHOLDER]',
      'Alumni founder network [PLACEHOLDER]',
      'Partner companies & internship leads [PLACEHOLDER]',
    ],
  },
]

export default function ResourcesPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-14">
      <PageHeader
        title="Resources"
        description="A curated library for student builders. Members get access to the full archive inside the workspace."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Card key={s.title}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <s.icon className="h-4 w-4 text-primary" aria-hidden /> {s.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {s.items.map((i) => (
                  <li key={i}>• {i}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="mt-6 text-xs text-muted-foreground">[PLACEHOLDER CONTENT — official resource links pending from the club]</p>
    </div>
  )
}
