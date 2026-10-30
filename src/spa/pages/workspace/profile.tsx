'use client'

// Profile settings (§6): users can edit only fields they are authorized to change —
// username is immutable and never editable here.
import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/spa/components/shared'
import { api } from '@/spa/api/client'
import { useAuth } from '@/spa/stores/auth'

type ProfileData = {
  username: string; displayName: string; bio: string | null; clubRoleLabel: string | null
  linkedinUrl: string | null; githubUrl: string | null; websiteUrl: string | null
  achievements: string[]; interests: string[]; isPublic: boolean; avatarUrl: string | null
}

export default function WorkspaceProfile() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { refresh } = useAuth()
  const { data, isLoading } = useQuery({ queryKey: ['my-profile'], queryFn: () => api.get<ProfileData>('/api/workspace/profile') })
  const [form, setForm] = useState<Partial<ProfileData>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.patch('/api/workspace/profile', {
        displayName: form.displayName,
        bio: form.bio ?? '',
        avatarUrl: form.avatarUrl ?? '',
        linkedinUrl: form.linkedinUrl ?? '',
        githubUrl: form.githubUrl ?? '',
        websiteUrl: form.websiteUrl ?? '',
        achievements: form.achievements ?? [],
        interests: form.interests ?? [],
      })
      toast({ title: 'Profile saved' })
      void qc.invalidateQueries({ queryKey: ['my-profile'] })
      void refresh()
    } catch {
      toast({ title: 'Could not save profile', description: 'Check URL formats (must start with https://) and try again.', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  if (isLoading || !data || !form.displayName) {
    return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96 rounded-xl" /></div>
  }

  return (
    <div>
      <PageHeader title="My Profile" description="Update how you appear in the public directory and to other members." />

      <form onSubmit={save} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Identity</CardTitle></CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pf-display">Display name</Label>
              <Input id="pf-display" value={form.displayName ?? ''} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required minLength={2} maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-username">Username (permanent)</Label>
              <Input id="pf-username" value={`@${data.username}`} disabled aria-describedby="pf-username-hint" />
              <p id="pf-username-hint" className="text-xs text-muted-foreground">Usernames are unique public identifiers and cannot be changed.</p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="pf-avatar">Profile photo</Label>
              <div className="flex items-center gap-3">
                {form.avatarUrl?.trim() ? (
                  <img src={form.avatarUrl.trim()} alt="Photo preview" className="h-14 w-14 shrink-0 rounded-full object-cover ring-1 ring-border" />
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/15 text-base font-bold text-primary" aria-hidden>
                    {(form.displayName ?? '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                  </span>
                )}
                <Input
                  id="pf-avatar"
                  value={form.avatarUrl ?? ''}
                  onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })}
                  placeholder="https://… or /avatars/member-1.png"
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">Shown next to your name on the public team page. Paste an image URL (https://) or a bundled path like /avatars/member-1.png.</p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="pf-bio">Bio</Label>
              <Textarea id="pf-bio" value={form.bio ?? ''} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={4} maxLength={2000} placeholder="Tell the club about yourself…" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="pf-interests">Tags / Areas of Interest</Label>
                <span className="text-xs text-muted-foreground">Click a pill to toggle</span>
              </div>
              <div className="flex flex-wrap gap-1.5 pb-1">
                {['Training', 'Operational', 'Internship & Placement'].map((tag) => {
                  const current = form.interests ?? []
                  const active = current.includes(tag)
                  return (
                    <Badge
                      key={tag}
                      variant={active ? 'default' : 'outline'}
                      className="cursor-pointer select-none text-xs"
                      onClick={() => {
                        const updated = active
                          ? current.filter((t) => t !== tag)
                          : [...current, tag]
                        setForm({ ...form, interests: updated })
                      }}
                    >
                      {active ? `✓ ${tag}` : `+ ${tag}`}
                    </Badge>
                  )
                })}
              </div>
              <Input
                id="pf-interests"
                value={(form.interests ?? []).join(', ')}
                onChange={(e) => setForm({ ...form, interests: e.target.value.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 15) })}
                placeholder="Training, Operational, Internship & Placement, startups..."
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Links</CardTitle></CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="pf-linkedin">LinkedIn</Label>
              <Input id="pf-linkedin" value={form.linkedinUrl ?? ''} onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })} placeholder="https://linkedin.com/in/…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-github">GitHub</Label>
              <Input id="pf-github" value={form.githubUrl ?? ''} onChange={(e) => setForm({ ...form, githubUrl: e.target.value })} placeholder="https://github.com/…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-website">Personal site</Label>
              <Input id="pf-website" value={form.websiteUrl ?? ''} onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })} placeholder="https://…" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Achievements</CardTitle></CardHeader>
          <CardContent>
            <Textarea
              aria-label="Achievements, one per line"
              value={(form.achievements ?? []).join('\n')}
              onChange={(e) => setForm({ ...form, achievements: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 20) })}
              rows={4}
              placeholder="One achievement per line, e.g. Led Pitch Day 2025"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">Shown on your public profile. One per line.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Visibility & email preferences</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="text-sm font-medium">Public directory listing</p>
                <p className="text-xs text-muted-foreground">Show your profile on the public team page. Final approval rests with administrators.</p>
              </div>
              <Switch checked={form.isPublic ?? false} disabled aria-label="Public listing (administrator approved)" />
            </div>
            <p className="text-xs text-muted-foreground">
              Public visibility is requested here and approved by administrators. Your email and other contact details
              are never shown publicly.
            </p>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
        </div>
      </form>
    </div>
  )
}
