'use client'

// Team directory (§5.2): search, role filter, responsive card grid, pagination.
// Clicking a member card opens an in-place detail dialog with the member's
// photo, position/role, bio, interests, achievements and LinkedIn / GitHub /
// Website links — "see all" without leaving the page. A "View full profile"
// action still leads to the §5.3 page for the complete record.
import { useEffect, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { ArrowRight, Award, ChevronDown, ExternalLink, Github, Globe, Linkedin, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader, EmptyState, Pagination, CardsSkeleton } from '@/spa/components/shared'
import { api, qs } from '@/spa/api/client'
import { navigate } from '@/spa/router'

type TeamCard = {
  username: string; displayName: string; clubRoleLabel: string | null
  bio: string | null; avatarUrl: string | null; linkedinUrl: string | null; githubUrl: string | null; interests: string[]
}

// Full public profile (§5.3) — fetched when the dialog opens; adds website and
// achievements on top of the card fields already in hand.
type MemberDetail = TeamCard & {
  websiteUrl: string | null
  achievements: string[]
}

const PAGE_SIZE = 12

export default function TeamPage() {
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [role, setRole] = useState('')
  const [page, setPage] = useState(1)
  const [selectedUsername, setSelectedUsername] = useState<string | null>(null)

  // Debounced search (§15); TanStack Query cancels stale requests by key.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300)
    return () => clearTimeout(t)
  }, [q])

  const { data, isLoading, isPlaceholderData } = useQuery({
    queryKey: ['team', debouncedQ, role, page],
    queryFn: () => api.get<{ total: number; profiles: TeamCard[] }>(`/api/public/team${qs({ q: debouncedQ, role, page, pageSize: PAGE_SIZE })}`),
    placeholderData: keepPreviousData,
  })

  const selected = data?.profiles.find((p) => p.username === selectedUsername) ?? null

  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <PageHeader title="Our Team" description="Meet the members building the club. Click a member to see their role, bio and links." />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }}
            placeholder="Search by name, username, role or bio…"
            className="pl-9"
            aria-label="Search team"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {['', 'President', 'Vice President', 'COO', 'Operational CEO', 'Events Lead', 'Member'].map((r) => (
            <Button
              key={r || 'all'}
              size="sm"
              variant={role === r ? 'default' : 'outline'}
              onClick={() => { setRole(r); setPage(1) }}
            >
              {r || 'All roles'}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <CardsSkeleton count={8} />
      ) : data?.profiles.length ? (
        <>
          <div className={`grid gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${isPlaceholderData ? 'opacity-60' : ''}`}>
            {data.profiles.map((p) => (
              <Card
                key={p.username}
                role="button"
                tabIndex={0}
                aria-haspopup="dialog"
                aria-label={`View ${p.displayName}'s details`}
                onClick={() => setSelectedUsername(p.username)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedUsername(p.username) }
                }}
                className="group cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              >
                <CardContent className="p-5">
                  <div className="flex items-center gap-3.5">
                    <Avatar name={p.displayName} url={p.avatarUrl} variant="card" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{p.displayName}</p>
                      <p className="truncate text-xs font-medium text-primary">{p.clubRoleLabel ?? 'Member'}</p>
                      <p className="truncate text-xs text-muted-foreground">@{p.username}</p>
                    </div>
                  </div>
                  {p.bio ? <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{p.bio}</p> : null}
                  <p className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors group-hover:text-primary">
                    View details
                    <ChevronDown className="h-3.5 w-3.5 transition-transform group-hover:translate-y-0.5" aria-hidden />
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
        </>
      ) : (
        <EmptyState title="No members found" description="Try a different search or filter." />
      )}

      <MemberDetailDialog card={selected} onClose={() => setSelectedUsername(null)} />
    </div>
  )
}

/**
 * Click-to-view member dialog. Renders instantly from the card's data, then
 * enriches with the full public profile (website, achievements) once fetched.
 */
function MemberDetailDialog({ card, onClose }: { card: TeamCard | null; onClose: () => void }) {
  const username = card?.username ?? ''
  const { data: detail } = useQuery({
    queryKey: ['member', username],
    queryFn: () => api.get<MemberDetail>(`/api/public/members/${encodeURIComponent(username)}`),
    enabled: Boolean(username),
    staleTime: 60_000,
  })

  const view = {
    displayName: detail?.displayName ?? card?.displayName ?? '',
    clubRoleLabel: detail?.clubRoleLabel ?? card?.clubRoleLabel ?? null,
    bio: detail?.bio ?? card?.bio ?? null,
    avatarUrl: detail?.avatarUrl ?? card?.avatarUrl ?? null,
    interests: detail?.interests ?? card?.interests ?? [],
    achievements: detail?.achievements ?? [],
    linkedinUrl: detail?.linkedinUrl ?? card?.linkedinUrl ?? null,
    githubUrl: detail?.githubUrl ?? card?.githubUrl ?? null,
    websiteUrl: detail?.websiteUrl ?? null,
  }
  const hasLinks = Boolean(view.linkedinUrl || view.githubUrl || view.websiteUrl)

  return (
    <Dialog open={Boolean(card)} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Member profile</DialogTitle>
          <DialogDescription>Only approved public information is shown.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4">
          <Avatar name={view.displayName} url={view.avatarUrl} variant="dialog" />
          <div className="min-w-0">
            <p className="truncate text-lg font-bold">{view.displayName}</p>
            <p className="truncate text-xs text-muted-foreground">@{username}</p>
            {view.clubRoleLabel ? (
              <span className="mt-2 inline-flex rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
                {view.clubRoleLabel}
              </span>
            ) : null}
          </div>
        </div>

        {view.bio ? <p className="text-sm leading-relaxed text-muted-foreground">{view.bio}</p> : null}

        {view.interests.length ? (
          <div className="flex flex-wrap gap-2">
            {view.interests.map((t) => (
              <span key={t} className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">{t}</span>
            ))}
          </div>
        ) : null}

        {view.achievements.length ? (
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <Award className="h-4 w-4 text-primary" aria-hidden /> Selected achievements
            </h3>
            <ul className="mt-2 space-y-1.5">
              {view.achievements.map((a, i) => (
                <li key={i} className="text-sm text-muted-foreground">• {a}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {hasLinks ? (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Connect</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {view.linkedinUrl ? (
                <SocialLink href={view.linkedinUrl} label="LinkedIn" icon={<Linkedin className="h-3.5 w-3.5" aria-hidden />} />
              ) : null}
              {view.githubUrl ? (
                <SocialLink href={view.githubUrl} label="GitHub" icon={<Github className="h-3.5 w-3.5" aria-hidden />} />
              ) : null}
              {view.websiteUrl ? (
                <SocialLink href={view.websiteUrl} label="Website" icon={<Globe className="h-3.5 w-3.5" aria-hidden />} />
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">This member has not added any public links yet.</p>
        )}

        <Button
          variant="outline"
          className="w-full"
          onClick={() => { onClose(); navigate(`/members/${username}`) }}
        >
          View full profile <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
        </Button>
      </DialogContent>
    </Dialog>
  )
}

function SocialLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
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

function Avatar({ name, url, variant }: { name: string; url: string | null; variant: 'card' | 'dialog' }) {
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  const box = variant === 'dialog' ? 'h-20 w-20 rounded-2xl' : 'h-14 w-14 rounded-full'
  return url ? (
    <img src={url} alt={`${name}'s photo`} className={`${box} shrink-0 object-cover ring-1 ring-border`} />
  ) : (
    <span
      className={`flex ${box} shrink-0 items-center justify-center bg-primary/15 font-bold text-primary ${variant === 'dialog' ? 'text-2xl' : 'text-base'}`}
      aria-hidden
    >
      {initials}
    </span>
  )
}
