'use client'

// Public member profile (§5.3) — only approved public data.
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink, Award, Linkedin, Github, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, formatDate } from '@/spa/components/shared'
import { api } from '@/spa/api/client'
import { navigate } from '@/spa/router'

type MemberProfile = {
  username: string; displayName: string; avatarUrl: string | null; bio: string | null
  clubRoleLabel: string | null; linkedinUrl: string | null; githubUrl: string | null
  websiteUrl: string | null; achievements: string[]; interests: string[]
}

export default function MemberProfilePage({ params }: { params: { username: string } }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['member', params.username],
    queryFn: () => api.get<MemberProfile>(`/api/public/members/${encodeURIComponent(params.username)}`),
    retry: false,
  })

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-14">
        <Skeleton className="h-40 rounded-xl" />
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-14">
        <EmptyState
          title="Member not found"
          description="This profile does not exist or is not publicly visible."
          action={<Button variant="outline" onClick={() => navigate('/team')}><ArrowLeft className="mr-1 h-4 w-4" /> Back to team</Button>}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <Button variant="ghost" size="sm" onClick={() => navigate('/team')} className="mb-6">
        <ArrowLeft className="mr-1 h-4 w-4" aria-hidden /> Team
      </Button>

      <Card>
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            <AvatarBlock name={data.displayName} url={data.avatarUrl} />
            <div>
              <h1 className="text-2xl font-bold">{data.displayName}</h1>
              <p className="text-sm text-muted-foreground">@{data.username}</p>
              {data.clubRoleLabel ? (
                <span className="mt-2 inline-flex rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
                  {data.clubRoleLabel}
                </span>
              ) : null}
            </div>
          </div>

          {data.bio ? <p className="mt-6 text-sm leading-relaxed text-muted-foreground">{data.bio}</p> : null}

          {data.interests.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {data.interests.map((t) => (
                <span key={t} className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">{t}</span>
              ))}
            </div>
          ) : null}

          {data.achievements.length ? (
            <div className="mt-6">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold"><Award className="h-4 w-4 text-primary" aria-hidden /> Selected achievements</h2>
              <ul className="mt-2 space-y-1.5">
                {data.achievements.map((a, i) => (
                  <li key={i} className="text-sm text-muted-foreground">• {a}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            {data.linkedinUrl ? <SocialLink href={data.linkedinUrl} label="LinkedIn" icon={<Linkedin className="h-3.5 w-3.5" aria-hidden />} /> : null}
            {data.githubUrl ? <SocialLink href={data.githubUrl} label="GitHub" icon={<Github className="h-3.5 w-3.5" aria-hidden />} /> : null}
            {data.websiteUrl ? <SocialLink href={data.websiteUrl} label="Website" icon={<Globe className="h-3.5 w-3.5" aria-hidden />} /> : null}
          </div>

          <p className="mt-8 text-xs text-muted-foreground/60">
            Profile last updated {formatDate(new Date(), false)} · Only approved public information is shown.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function SocialLink({ href, label, icon }: { href: string; label: string; icon?: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
    >
      {icon}
      {label} <ExternalLink className="h-3 w-3 text-muted-foreground" aria-hidden />
    </a>
  )
}

function AvatarBlock({ name, url }: { name: string; url: string | null }) {
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  return url ? (
     
    <img src={url} alt={`${name}'s avatar`} className="h-20 w-20 rounded-2xl object-cover" />
  ) : (
    <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/15 text-2xl font-bold text-primary" aria-hidden>
      {initials}
    </span>
  )
}
