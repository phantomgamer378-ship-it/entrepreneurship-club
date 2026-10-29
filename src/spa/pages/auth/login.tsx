'use client'

// Sign-in (§6). Rate-limited server-side; errors are generic to prevent enumeration.
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from '@/spa/lib/shims'
import { useAuth } from '@/spa/stores/auth'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BrandMark } from '@/components/brand-mark'
import { api } from '@/spa/api/client'
import { navigate } from '@/spa/router'

/** Staff roles (president, faculty advisor, admin, super admin) hold at least one
 *  of these control-panel permissions; plain members never do. Staff land in the
 *  Administration Panel after sign-in, everyone else in the member workspace. */
function homeAfterLogin(session: { permissions?: string[] } | null): '/control' | '/workspace' {
  const perms = session?.permissions ?? []
  return perms.includes('applications.read') || perms.includes('members.read') ? '/control' : '/workspace'
}

export default function LoginPage() {
  const { refresh, authenticated, loading, permissions } = useAuth()
  const { toast } = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const params = useSearchParams()

  useEffect(() => {
    if (!loading && authenticated) {
      const next = params.get('next')
      navigate(next && next.startsWith('/') ? next : homeAfterLogin({ permissions }))
    }
  }, [authenticated, loading, params, permissions])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await api.post('/api/auth/login', { email, password })
      const session = await refresh()
      const next = params.get('next')
      navigate(next && next.startsWith('/') ? next : homeAfterLogin(session))
    } catch {
      toast({ title: 'Sign in failed', description: 'Check your email and password, then try again.', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <BrandMark className="mx-auto h-16 w-16" />
          <h1 className="mt-4 text-2xl font-bold">Sign in to the Entrepreneurship Club</h1>
          <p className="mt-1 text-sm text-muted-foreground">Members workspace · ALTA School of Technology, ADYPU</p>
        </div>

        <Card>
          <CardContent className="p-6 sm:p-8">
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="login-email">Email</Label>
                <Input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="you@student.adypu.edu.in" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="login-password">Password</Label>
                <Input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" placeholder="••••••••••" />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
            <div className="mt-4 flex items-center justify-between text-sm">
              <button className="text-primary hover:underline" onClick={() => navigate('/auth/forgot-password')}>Forgot password?</button>
              <button className="text-muted-foreground hover:underline" onClick={() => navigate('/join')}>Apply to join</button>
            </div>
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Accounts are created only through approved invitations — there is no public sign-up.
        </p>
      </div>
    </div>
  )
}
