'use client'

// Role & permission editor (§7.5): view grants + who assigned, create custom roles with
// a bundled permission matrix (PRD §8 — Super-Admin-exclusive permissions visibly
// disabled), grant/revoke scoped permissions. System roles and Super Admin are protected.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, Plus, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PageHeader, ErrorNote, formatDate } from '@/spa/components/shared'
import { api } from '@/spa/api/client'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/spa/stores/auth'

type Grant = { id: string; scope: string; grantedBy: string | null; grantedAt: string; permission: { key: string } }
type Role = { id: string; key: string; name: string; description: string | null; isSystem: boolean; rolePermissions: Grant[]; _count: { userRoles: number } }
type PermissionDef = { id: string; key: string; description: string | null }

// Mirrors SUPER_ADMIN_EXCLUSIVE_PERMISSIONS in src/lib/rbac/permissions.ts — server
// rejects these in custom roles regardless of what the UI sends.
const SUPER_ADMIN_EXCLUSIVE = new Set([
  'members.role.assign', 'members.permissions.grant', 'members.create', 'members.delete',
  'audit.read', 'settings.manage', 'roles.create', 'video.end_for_all',
])

export default function ControlRoles() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { permissions: myPermissions } = useAuth()
  const { data, isLoading, error } = useQuery({ queryKey: ['ctl-roles-full'], queryFn: () => api.get<{ roles: Role[]; permissions: PermissionDef[] }>('/api/control/roles'), retry: false })

  const [createOpen, setCreateOpen] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newName, setNewName] = useState('')
  const [newPerms, setNewPerms] = useState<Set<string>>(new Set())
  const [grantTarget, setGrantTarget] = useState<Role | null>(null)
  const [grantPerm, setGrantPerm] = useState('')
  const [grantScope, setGrantScope] = useState('*')
  const iAmSuperAdmin = myPermissions.includes('roles.create')

  async function createRole(e: React.FormEvent) {
    e.preventDefault()
    try {
      await api.post('/api/control/roles', { name: newName, permissionIds: [...newPerms] })
      toast({ title: 'Custom role created' })
      setCreateOpen(false); setNewKey(''); setNewName(''); setNewPerms(new Set())
      void qc.invalidateQueries({ queryKey: ['ctl-roles-full'] })
    } catch (err) {
      toast({ title: 'Could not create role', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    }
  }

  function togglePerm(id: string, key: string, checked: boolean) {
    setNewPerms((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      void key
      return next
    })
  }

  async function grant() {
    if (!grantTarget || !grantPerm) return
    try {
      await api.put('/api/control/roles', { roleId: grantTarget.id, permissionId: grantPerm, scope: grantScope || '*' })
      toast({ title: 'Permission granted' })
      setGrantTarget(null); setGrantPerm(''); setGrantScope('*')
      void qc.invalidateQueries({ queryKey: ['ctl-roles-full'] })
    } catch (err) {
      toast({ title: 'Grant failed', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    }
  }

  async function revoke(roleId: string, permissionKey: string, scope: string) {
    try {
      await api.del('/api/control/roles', { roleId, permissionId: permissionKey, scope })
      toast({ title: 'Permission revoked' })
      void qc.invalidateQueries({ queryKey: ['ctl-roles-full'] })
    } catch (err) {
      toast({ title: 'Revoke failed', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    }
  }

  if (error) return <ErrorNote message="You are not authorized to view roles and permissions." />

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        description="Database-backed RBAC. Authorization denies by default; this view shows effective role grants."
        actions={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-4 w-4" aria-hidden /> Custom role</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Create custom role</DialogTitle></DialogHeader>
              <form onSubmit={createRole} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="cr-name">Display name</Label>
                  <Input id="cr-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Sponsorship Lead" required />
                </div>
                <div className="space-y-1.5">
                  <Label>Permissions</Label>
                  <ScrollArea className="max-h-64 rounded-lg border p-3">
                    <div className="space-y-1.5">
                      {(data?.permissions ?? []).map((p) => {
                        const exclusive = SUPER_ADMIN_EXCLUSIVE.has(p.key)
                        const disabled = exclusive // server rejects exclusives for custom roles
                        return (
                          <div key={p.id} className="flex items-start gap-2">
                            <Checkbox
                              id={`perm-${p.id}`}
                              checked={newPerms.has(p.id)}
                              disabled={disabled}
                              onCheckedChange={(v) => togglePerm(p.id, p.key, v === true)}
                            />
                            <Label htmlFor={`perm-${p.id}`} className={`text-xs font-normal ${disabled ? 'text-muted-foreground' : ''}`}>
                              <code>{p.key}</code>
                              {exclusive ? (
                                <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"><Lock className="h-2.5 w-2.5" aria-hidden />Super-Admin exclusive</span>
                              ) : null}
                            </Label>
                          </div>
                        )
                      })}
                    </div>
                  </ScrollArea>
                  <p className="text-xs text-muted-foreground">Super-Admin-exclusive permissions can never be bundled into a custom role — the server enforces this too.</p>
                </div>
                <Button type="submit" className="w-full" disabled={!iAmSuperAdmin}>Create role</Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}</div>
      ) : (
        <Accordion type="single" collapsible className="space-y-3">
          {data?.roles.map((r) => (
            <Card key={r.id}>
              <AccordionItem value={r.id} className="border-none">
                <AccordionTrigger className="px-5 py-4 hover:no-underline">
                  <div className="flex flex-1 flex-wrap items-center gap-2 text-left">
                    <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
                    <span className="text-sm font-semibold">{r.name}</span>
                    <code className="text-xs text-muted-foreground">{r.key}</code>
                    {r.isSystem ? <Badge variant="outline">system</Badge> : <Badge variant="secondary">custom</Badge>}
                    <Badge variant="secondary">{r._count.userRoles} assigned</Badge>
                    <Badge variant="secondary">{r.rolePermissions.length} permissions</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-5 pb-5">
                  {r.description ? <p className="mb-3 text-xs text-muted-foreground">{r.description}</p> : null}
                  <ScrollArea className="max-h-60 rounded-lg border">
                    <div className="divide-y">
                      {r.rolePermissions.length ? r.rolePermissions.map((g) => (
                        <div key={g.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                          <code className="font-medium">{g.permission.key}</code>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            {g.scope !== '*' ? <Badge variant="outline" className="text-[10px]">{g.scope}</Badge> : null}
                            <span title={`Granted ${formatDate(g.grantedAt)}`}>by {g.grantedBy ?? 'seed'}</span>
                            {r.key === 'super_admin' && r.isSystem ? null : (
                              <button className="text-destructive hover:underline" onClick={() => void revoke(r.id, g.permission.key, g.scope)}>revoke</button>
                            )}
                          </div>
                        </div>
                      )) : <p className="px-3 py-4 text-center text-xs text-muted-foreground">No permissions granted.</p>}
                    </div>
                  </ScrollArea>
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => { setGrantTarget(r); setGrantPerm('') }}>
                    <Plus className="mr-1 h-3.5 w-3.5" aria-hidden /> Grant permission
                  </Button>
                </AccordionContent>
              </AccordionItem>
            </Card>
          ))}
        </Accordion>
      )}

      <Dialog open={Boolean(grantTarget)} onOpenChange={(v) => !v && setGrantTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Grant permission to {grantTarget?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Permission</Label>
              <Select value={grantPerm} onValueChange={setGrantPerm}>
                <SelectTrigger aria-label="Permission"><SelectValue placeholder="Choose a permission" /></SelectTrigger>
                <SelectContent>
                  <ScrollArea className="max-h-64">
                    {data?.permissions.map((p) => <SelectItem key={p.id} value={p.key}>{p.key}</SelectItem>)}
                  </ScrollArea>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gp-scope">Scope</Label>
              <Input id="gp-scope" value={grantScope} onChange={(e) => setGrantScope(e.target.value)} placeholder="* or event:{id}" />
            </div>
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              You can only grant permissions you hold yourself. Escalation attempts are blocked and audited.
            </p>
            <Button className="w-full" onClick={grant} disabled={!grantPerm}>Grant</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
