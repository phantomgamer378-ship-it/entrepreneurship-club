'use client'

// Club settings (§7): key/value editing for tagline, mission, vision, contacts.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader, ErrorNote } from '@/spa/components/shared'
import { api } from '@/spa/api/client'
import { useToast } from '@/hooks/use-toast'

type Setting = { key: string; value: unknown; updatedBy: string | null; updatedAt: string }

export default function ControlSettings() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { data, isLoading, error } = useQuery({ queryKey: ['ctl-settings'], queryFn: () => api.get<{ settings: Setting[] }>('/api/control/settings'), retry: false })
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')

  async function save(key: string, value: unknown) {
    try {
      await api.patch('/api/control/settings', { key, value })
      toast({ title: 'Setting saved' })
      void qc.invalidateQueries({ queryKey: ['ctl-settings'] })
    } catch (err) {
      toast({ title: 'Could not save setting', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    }
  }

  if (error) return <ErrorNote message="You are not authorized to change settings." />

  const settings = data?.settings ?? []

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Club content used across the public site. Changes apply immediately and are audited."
      />

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)}</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {settings.map((s) => {
            const str = typeof s.value === 'string' ? s.value : JSON.stringify(s.value)
            const isLong = typeof str === 'string' && str.length > 80
            return (
              <Card key={s.key}>
                <CardHeader>
                  <CardTitle className="text-sm">
                    <code>{s.key}</code>
                    {s.updatedBy ? <span className="ml-2 text-xs font-normal text-muted-foreground">by {s.updatedBy}</span> : null}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {isLong || typeof s.value === 'string' ? (
                    <Textarea
                      aria-label={`Value for ${s.key}`}
                      defaultValue={str}
                      rows={isLong ? 4 : 2}
                      onChange={(e) => setDrafts({ ...drafts, [s.key]: e.target.value })}
                    />
                  ) : (
                    <Input
                      aria-label={`Value for ${s.key}`}
                      defaultValue={str}
                      onChange={(e) => setDrafts({ ...drafts, [s.key]: e.target.value })}
                    />
                  )}
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Updated {new Date(s.updatedAt).toLocaleString('en-IN')}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const raw = drafts[s.key]
                        if (raw === undefined) return
                        let parsed: unknown = raw
                        if (raw === 'true') parsed = true
                        else if (raw === 'false') parsed = false
                        else if (/^\d+$/.test(raw)) parsed = Number(raw)
                        void save(s.key, parsed)
                      }}
                    >
                      <Save className="mr-1 h-3.5 w-3.5" aria-hidden /> Save
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Card className="mt-6">
        <CardHeader><CardTitle className="text-sm">Add a new setting</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="key e.g. club.tagline" aria-label="Setting key" className="sm:max-w-xs" />
          <Input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="value" aria-label="Setting value" />
          <Button
            onClick={async () => {
              if (!newKey.trim()) return
              await save(newKey.trim(), newValue)
              setNewKey(''); setNewValue('')
            }}
          >
            Add setting
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
