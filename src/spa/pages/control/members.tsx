'use client'

// Member management (§7.3): list, edit metadata, assign/remove roles, suspend/reactivate.
import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, ShieldPlus, ShieldMinus, PauseCircle, PlayCircle, UserCog, UserPlus, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader, EmptyState, StatusBadge, formatDate, ErrorNote } from '@/spa/components/shared'
import { api, qs } from '@/spa/api/client'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/spa/stores/auth'

type Member = {
  id: string; email: string; fullName: string; isActive: boolean; suspendedAt: string | null
  suspendedReason: string | null; lastLoginAt: string | null; createdAt: string
  profile: { id: string; username: string; displayName: string; clubRoleLabel: string | null; isPublic: boolean; avatarUrl: string | null; linkedinUrl: string | null; githubUrl: string | null } | null
  userRoles: { id: string; scope: string; expiresAt: string | null; assignedBy: string | null; assignedAt: string; role: { id: string; key: string; name: string } }[]
}
type RoleDef = { id: string; key: string; name: string; isSystem: boolean }

export default function ControlMembers() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { user: me, roles: myRoles } = useAuth()
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [roleTarget, setRoleTarget] = useState<Member | null>(null)
  const [editTarget, setEditTarget] = useState<Member | null>(null)
  const [editName, setEditName] = useState('')
  const [editLabel, setEditLabel] = useState('')
  const [editPublic, setEditPublic] = useState(false)
  const [editAvatar, setEditAvatar] = useState('')
  const [editLinkedin, setEditLinkedin] = useState('')
  const [editGithub, setEditGithub] = useState('')
  const [assignRole, setAssignRole] = useState('')
  const [assignScope, setAssignScope] = useState('*')
  // PRD §8 — Add Member dialog (members.create; Super-Admin-exclusive).
  const [showAdd, setShowAdd] = useState(false)
  const [addMode, setAddMode] = useState<'invite' | 'active'>('invite')
  const [addEmail, setAddEmail] = useState('')
  const [addUsername, setAddUsername] = useState('')
  const [addDisplayName, setAddDisplayName] = useState('')
  const [addRoleId, setAddRoleId] = useState('')
  const [addPublic, setAddPublic] = useState(false)
  const [adding, setAdding] = useState(false)
  const iAmSuperAdmin = myRoles.includes('super_admin')

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300)
    return () => clearTimeout(t)
  }, [q])

  const { data, isLoading, error } = useQuery({
    queryKey: ['ctl-members', debounced],
    queryFn: () => api.get<{ users: Member[] }>(`/api/control/members${qs({ q: debounced })}`),
    retry: false,
  })
  const { data: rolesData } = useQuery({
    queryKey: ['ctl-roles'],
    queryFn: () => api.get<{ roles: RoleDef[] }>('/api/control/roles'),
  })

  async function action(member: Member, act: 'suspend' | 'reactivate') {
    try {
      await api.patch('/api/control/members', { targetId: member.id, action: act, reason: act === 'suspend' ? 'Suspended via control panel' : undefined })
      toast({ title: act === 'suspend' ? 'Member suspended' : 'Member reactivated' })
      void qc.invalidateQueries({ queryKey: ['ctl-members'] })
      void qc.invalidateQueries({ queryKey: ['ctl-overview'] })
    } catch (err) {
      toast({ title: 'Action failed', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    }
  }

  async function removeRole(member: Member, roleId: string, scope: string) {
    try {
      await api.del(`/api/control/members/${member.id}/roles`, { userId: member.id, roleId, scope })
      toast({ title: 'Role removed' })
      void qc.invalidateQueries({ queryKey: ['ctl-members'] })
    } catch (err) {
      toast({ title: 'Could not remove role', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    }
  }

  async function addRole() {
    if (!roleTarget || !assignRole) return
    try {
      await api.post(`/api/control/members/${roleTarget.id}/roles`, { userId: roleTarget.id, roleId: assignRole, scope: assignScope || '*' })
      toast({ title: 'Role assigned' })
      setRoleTarget(null)
      setAssignRole('')
      setAssignScope('*')
      void qc.invalidateQueries({ queryKey: ['ctl-members'] })
    } catch (err) {
      toast({ title: 'Assignment failed', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    }
  }

  async function saveEdit() {
    if (!editTarget) return
    try {
      await api.patch('/api/control/members', {
        targetId: editTarget.id, action: 'update',
        fullName: editName, clubRoleLabel: editLabel, isPublic: editPublic,
        avatarUrl: editAvatar, linkedinUrl: editLinkedin, githubUrl: editGithub,
      })
      toast({ title: 'Member updated' })
      setEditTarget(null)
      void qc.invalidateQueries({ queryKey: ['ctl-members'] })
    } catch (err) {
      toast({ title: 'Update failed', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    }
  }

  async function submitAddMember() {
    setAdding(true)
    try {
      const res = await api.post<{ ok: boolean; mode: string; inviteId?: string; profileId?: string }>('/api/control/members', {
        email: addEmail,
        username: addUsername,
        displayName: addDisplayName,
        roleId: addRoleId || undefined,
        mode: addMode,
        ...(addMode === 'active' ? { isPublic: addPublic } : {}),
      })
      toast({
        title: addMode === 'invite' ? 'Invitation sent' : 'Member created',
        description:
          addMode === 'invite'
            ? 'They will receive an invite email with a single-use activation link. Once they accept, their profile is listed on Our Team.'
            : addPublic
              ? 'They appear on the public Our Team page and were emailed a single-use set-your-password link.'
              : 'They were emailed a single-use set-your-password link. They are NOT on Our Team yet — toggle “Public directory listing” via Edit when ready.',
      })
      void res
      setShowAdd(false)
      setAddEmail(''); setAddUsername(''); setAddDisplayName(''); setAddRoleId(''); setAddMode('invite'); setAddPublic(false)
      void qc.invalidateQueries({ queryKey: ['ctl-members'] })
      void qc.invalidateQueries({ queryKey: ['ctl-invites'] })
    } catch (err) {
      toast({ title: 'Could not create member', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    } finally {
      setAdding(false)
    }
  }

  if (error) return <ErrorNote message="You are not authorized to manage members." />

  return (
    <div>
      <PageHeader
        title="Members"
        description="Manage member metadata, roles and access. Role history is preserved."
        actions={iAmSuperAdmin ? (
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <UserPlus className="mr-1 h-4 w-4" aria-hidden /> Add Member
          </Button>
        ) : null}
      />

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members…" className="pl-9" aria-label="Search members" />
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}</div>
      ) : data?.users.length ? (
        <div className="space-y-3">
          {data.users.map((m) => (
            <Card key={m.id}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{m.fullName}</p>
                      {m.id === me?.id ? <Badge variant="outline">You</Badge> : null}
                      {!m.isActive ? <Badge variant="secondary">Not activated</Badge> : null}
                      {m.suspendedAt ? <StatusBadge status="suspended" /> : null}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {m.email} · @{m.profile?.username ?? 'no-profile'} · joined {formatDate(m.createdAt, false)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.userRoles.length ? m.userRoles.map((ur) => (
                        <Badge key={ur.id} variant="secondary" className="gap-1">
                          {ur.role.name}{ur.scope !== '*' ? ` · ${ur.scope}` : ''}
                          <button
                            className="ml-1 rounded-full px-1 text-muted-foreground hover:text-destructive"
                            aria-label={`Remove ${ur.role.name}`}
                            onClick={() => void removeRole(m, ur.role.id, ur.scope)}
                          >
                            ×
                          </button>
                        </Badge>
                      )) : <span className="text-xs text-muted-foreground">No roles assigned</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setRoleTarget(m); setAssignRole('') }}>
                      <ShieldPlus className="mr-1 h-3.5 w-3.5" aria-hidden /> Roles
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setEditTarget(m); setEditName(m.fullName); setEditLabel(m.profile?.clubRoleLabel ?? ''); setEditPublic(m.profile?.isPublic ?? false); setEditAvatar(m.profile?.avatarUrl ?? ''); setEditLinkedin(m.profile?.linkedinUrl ?? ''); setEditGithub(m.profile?.githubUrl ?? '') }}>
                      <UserCog className="mr-1 h-3.5 w-3.5" aria-hidden /> Edit
                    </Button>
                    {m.suspendedAt ? (
                      <Button size="sm" variant="outline" onClick={() => void action(m, 'reactivate')}>
                        <PlayCircle className="mr-1 h-3.5 w-3.5" aria-hidden /> Reactivate
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="text-destructive" onClick={() => void action(m, 'suspend')}>
                        <PauseCircle className="mr-1 h-3.5 w-3.5" aria-hidden /> Suspend
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No members found" />
      )}

      {/* PRD §8 — Add Member dialog (mode toggle: Send Invite / Create Active Now) */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add member directly</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Creation mode">
              <Button
                type="button" variant={addMode === 'invite' ? 'default' : 'outline'}
                onClick={() => setAddMode('invite')} aria-pressed={addMode === 'invite'}
              >
                Send Invite
              </Button>
              <Button
                type="button" variant={addMode === 'active' ? 'default' : 'outline'}
                onClick={() => setAddMode('active')} aria-pressed={addMode === 'active'}
              >
                Create Active Now
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {addMode === 'invite'
                ? 'They receive a single-use invitation link and set their own password. Safer default.'
                : 'The account is activated immediately with a random temporary password that is never emailed — they receive a single-use "set your password" link instead.'}
            </p>
            {addMode === 'active' ? (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Public directory listing</p>
                  <p className="text-xs text-muted-foreground">List this member on the public Our Team page (§5.2 approved profiles).</p>
                </div>
                <Switch checked={addPublic} onCheckedChange={setAddPublic} aria-label="Public directory listing" />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="am-email">Email</Label>
              <Input id="am-email" type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="member@student.adypu.edu.in" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="am-username">Username</Label>
                <Input id="am-username" value={addUsername} onChange={(e) => setAddUsername(e.target.value.toLowerCase())} placeholder="first.last" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="am-name">Display name</Label>
                <Input id="am-name" value={addDisplayName} onChange={(e) => setAddDisplayName(e.target.value)} placeholder="Full name" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={addRoleId} onValueChange={setAddRoleId}>
                <SelectTrigger aria-label="Role for new member"><SelectValue placeholder="Choose a role" /></SelectTrigger>
                <SelectContent>
                  {(rolesData?.roles ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id} disabled={r.key === 'super_admin' && !iAmSuperAdmin}>
                      {r.name}{r.key === 'super_admin' && !iAmSuperAdmin ? ' (Super Admin only)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                Granting Super Admin to a new member requires you to already be a Super Admin — same rule as role assignment.
              </p>
            </div>
            <Button
              className="w-full" onClick={submitAddMember} disabled={adding || !addEmail || !addUsername || !addDisplayName || !addRoleId}
            >
              {adding ? 'Working…' : addMode === 'invite' ? 'Send invitation' : 'Create active member'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Role assignment dialog */}
      <Dialog open={Boolean(roleTarget)} onOpenChange={(v) => !v && setRoleTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign role to {roleTarget?.fullName}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={assignRole} onValueChange={setAssignRole}>
                <SelectTrigger aria-label="Role"><SelectValue placeholder="Choose a role" /></SelectTrigger>
                <SelectContent>
                  {(rolesData?.roles ?? []).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scope-input">Resource scope (optional)</Label>
              <Input id="scope-input" value={assignScope} onChange={(e) => setAssignScope(e.target.value)} placeholder="* or event:{id}" />
              <p className="text-xs text-muted-foreground">&ldquo;*&rdquo; grants club-wide; e.g. <code>event:xyz</code> limits the role to one resource.</p>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              <ShieldMinus className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              Admin and Super Admin roles can only be granted by a Super Admin. The last active Super Admin cannot be demoted.
            </div>
            <Button className="w-full" onClick={addRole} disabled={!assignRole}>Assign role</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={Boolean(editTarget)} onOpenChange={(v) => !v && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit {editTarget?.fullName}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="em-name">Full name</Label>
              <Input id="em-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="em-label">Public role label</Label>
              <Input id="em-label" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} placeholder="e.g. Events Lead" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="em-avatar">Profile photo</Label>
              <div className="flex items-center gap-3">
                {editAvatar.trim() ? (
                  <img src={editAvatar.trim()} alt="Photo preview" className="h-12 w-12 shrink-0 rounded-full object-cover ring-1 ring-border" />
                ) : (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary" aria-hidden>?</span>
                )}
                <Input id="em-avatar" value={editAvatar} onChange={(e) => setEditAvatar(e.target.value)} placeholder="https://… or /avatars/member-1.png" className="flex-1" />
              </div>
              <p className="text-xs text-muted-foreground">Shown on the team page and public profile. Paste any image URL, or one of the bundled paths: /avatars/member-1.png … member-6.png</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="em-linkedin">LinkedIn URL</Label>
                <Input id="em-linkedin" value={editLinkedin} onChange={(e) => setEditLinkedin(e.target.value)} placeholder="https://linkedin.com/in/…" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="em-github">GitHub URL</Label>
                <Input id="em-github" value={editGithub} onChange={(e) => setEditGithub(e.target.value)} placeholder="https://github.com/…" />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Public directory listing</p>
                <p className="text-xs text-muted-foreground">Approve this profile for the public team page.</p>
              </div>
              <Switch checked={editPublic} onCheckedChange={setEditPublic} aria-label="Public listing" />
            </div>
            <Button className="w-full" onClick={saveEdit}>Save changes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
