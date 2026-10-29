'use client'

// Control panel sign-in (/control/sign-in). Route is not linked from public navigation.
import { useEffect, useState } from 'react'
import { useAuth } from '@/spa/stores/auth'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ShieldCheck } from 'lucide-react'
import { api } from '@/spa/api/client'
import { navigate } from '@/spa/router'

export default function ControlSignIn() {
  const { refresh, authenticated, loading } = useAuth()
  const { toast } = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!loading && authenticated) navigate('/control')
  }, [authenticated, loading])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await api.post('/api/auth/login', { email, password })
      await refresh()
      navigate('/control')
    } catch {
      toast({ title: 'Access denied', description: 'Invalid credentials for the administration panel.', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center text-zinc-100">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 text-zinc-900">
            <ShieldCheck className="h-6 w-6" aria-hidden />
          </span>
          <h1 className="mt-4 text-2xl font-bold">Administration Panel</h1>
          <p className="mt-1 text-sm text-zinc-400">Authorized personnel only. All actions are audited.</p>
        </div>
        <Card className="border-zinc-800 bg-zinc-900 text-zinc-100">
          <CardContent className="p-6 sm:p-8">
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ctl-email" className="text-zinc-300">Email</Label>
                <Input id="ctl-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="border-zinc-700 bg-zinc-950 text-zinc-100" autoComplete="email" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ctl-password" className="text-zinc-300">Password</Label>
                <Input id="ctl-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="border-zinc-700 bg-zinc-950 text-zinc-100" autoComplete="current-password" />
              </div>
              <Button type="submit" className="w-full bg-zinc-100 text-zinc-900 hover:bg-zinc-200" disabled={submitting}>
                {submitting ? 'Verifying…' : 'Sign in to Control Panel'}
              </Button>
            </form>
            <p className="mt-4 text-center text-xs text-zinc-500">
              Every administrative operation is enforced by backend authorization — this screen is convenience only.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
