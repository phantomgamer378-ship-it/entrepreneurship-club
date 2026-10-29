'use client'

// Teacher management (§7.4): faculty listing + controlled invitations.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { GraduationCap, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { PageHeader, EmptyState, formatDate, ErrorNote } from '@/spa/components/shared'
import { api } from '@/spa/api/client'
import { useToast } from '@/hooks/use-toast'

type Member = { id: string; email: string; fullName: string; isActive: boolean; suspendedAt: string | null; lastLoginAt: string | null; profile: { username: string; clubRoleLabel: string | null } | null }
type Invite = { id: string; email: string; type: string; status: string; sentCount: number; lastSentAt: string | null; expiresAt: string; createdAt: string }

export default function ControlTeachers() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [inviting, setInviting] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['ctl-teachers'],
    queryFn: () => api.get<{ users: Member[] }>('/api/control/members?teachers=true'),
    retry: false,
  })
  const { data: invitesData } = useQuery({ queryKey: ['ctl-invites'], queryFn: () => api.get<{ invites: Invite[] }>('/api/control/invites') })

  const teacherInvites = (invitesData?.invites ?? []).filter((i) => i.type === 'teacher')

  async function inviteTeacher(e: React.FormEvent) {
    e.preventDefault()
    setInviting(true)
    try {
      await api.post('/api/control/invites', { email, type: 'teacher', roleKey: 'faculty_advisor' })
      toast({ title: 'Teacher invitation queued', description: 'A single-use secure link was emailed.' })
      setOpen(false)
      setEmail('')
      void qc.invalidateQueries({ queryKey: ['ctl-invites'] })
    } catch (err) {
      toast({ title: 'Could not invite', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    } finally {
      setInviting(false)
    }
  }

  if (error) return <ErrorNote message="You are not authorized to manage teachers." />

  return (
    <div>
      <PageHeader
        title="Teachers & Faculty Advisors"
        description="Faculty can review applications only when granted the relevant permissions."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Mail className="mr-1 h-4 w-4" aria-hidden /> Invite teacher</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Invite a faculty advisor</DialogTitle></DialogHeader>
              <form onSubmit={inviteTeacher} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="t-email">Institutional email</Label>
                  <Input id="t-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="advisor@adypu.edu.in" />
                </div>
                <p className="text-xs text-muted-foreground">
                  They will receive a single-use invitation to activate their account with the Faculty Advisor role.
                  Notification recipients are restricted to authorized accounts.
                </p>
                <Button type="submit" className="w-full" disabled={inviting}>{inviting ? 'Sending…' : 'Send invitation'}</Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Active faculty</h2>
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}</div>
          ) : data?.users.length ? (
            <div className="space-y-3">
              {data.users.map((t) => (
                <Card key={t.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm font-semibold">{t.fullName}</p>
                      <p className="text-xs text-muted-foreground">{t.email} · @{t.profile?.username ?? '—'}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t.suspendedAt ? 'Suspended' : t.lastLoginAt ? `Last sign-in ${formatDate(t.lastLoginAt, false)}` : 'Never signed in'}
                      </p>
                    </div>
                    <GraduationCap className="h-5 w-5 text-primary" aria-hidden />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState title="No faculty members yet" description="Invite the first faculty advisor." />
          )}
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Teacher invitations</h2>
          {teacherInvites.length ? (
            <div className="space-y-3">
              {teacherInvites.map((i) => (
                <Card key={i.id}>
                  <CardContent className="p-4">
                    <p className="text-sm font-medium">{i.email}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {i.status} · sent ×{i.sentCount} · expires {formatDate(i.expiresAt, false)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState title="No teacher invitations" />
          )}
        </div>
      </div>
    </div>
  )
}
