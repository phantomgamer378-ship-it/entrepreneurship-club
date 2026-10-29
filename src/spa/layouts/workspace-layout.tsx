'use client'

// Member workspace chrome: sidebar with sections the user's permissions allow.
import { useEffect } from 'react'
import {
  LayoutDashboard, UserCircle2, MessagesSquare, Video, Volume2, Bell, LogOut, ArrowLeft,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ThemeToggle } from '@/components/theme-toggle'
import { BrandMark } from '@/components/brand-mark'
import { useAuth } from '@/spa/stores/auth'
import { navigate, useHashPath } from '@/spa/router'
import { PageLoader } from '@/spa/router'
import { api } from '@/spa/api/client'

const ITEMS = [
  { path: '/workspace', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard.view' },
  { path: '/workspace/profile', label: 'My Profile', icon: UserCircle2, permission: null },
  { path: '/workspace/messages', label: 'Messages', icon: MessagesSquare, permission: 'messages.use' },
  { path: '/workspace/voice', label: 'Voice Lounge', icon: Volume2, permission: null },
  { path: '/workspace/meetings', label: 'Meetings', icon: Video, permission: 'video.create' },
  { path: '/workspace/notifications', label: 'Notifications', icon: Bell, permission: null },
  // Staff-only bridge to the Administration Panel (same gate as the post-login
  // redirect: president/faculty/admin/super admin hold members.read, members don't).
  { path: '/control', label: 'Control Panel', icon: ShieldCheck, permission: 'members.read' },
]

export function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { loading, authenticated, user, permissions, logout, refresh } = useAuth()
  const path = useHashPath()

  useEffect(() => {
    if (!loading && !authenticated) navigate('/auth/login')
  }, [loading, authenticated])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (loading || !authenticated || !user) return <PageLoader />

  const allowed = ITEMS.filter((i) => !i.permission || permissions.includes(i.permission))

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="flex shrink-0 flex-col border-b bg-card lg:min-h-screen lg:w-64 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-4">
          <button onClick={() => navigate('/workspace')} className="flex items-center gap-2 font-bold">
            <BrandMark className="h-8 w-8" />
            <span className="whitespace-nowrap hidden sm:inline">Member Workspace</span>
            <span className="whitespace-nowrap sm:hidden">Workspace</span>
          </button>
          <div className="flex items-center gap-2">
            {/* Badge hidden in the narrow lg+ sidebar column — the role already shows
                in the footer user block; shown in the sm–lg full-width top bar. */}
            <Badge variant="secondary" className="hidden lg:hidden sm:inline-flex">{user.clubRoleLabel ?? 'Member'}</Badge>
            <ThemeToggle />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-3 lg:flex-col lg:overflow-visible lg:pb-0" aria-label="Workspace navigation">
          {allowed.map((item) => {
            const active = path === item.path || (item.path !== '/workspace' && path.startsWith(item.path))
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                aria-current={active ? 'page' : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                <item.icon className="h-4 w-4" aria-hidden />
                {item.label}
              </button>
            )
          })}
        </nav>
        <div className="mt-auto hidden border-t p-3 lg:block">
          <div className="mb-2 px-1">
            <p className="truncate text-sm font-medium">{user.displayName}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => navigate('/')}>
            <ArrowLeft className="mr-1 h-4 w-4" aria-hidden /> Public site
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-destructive hover:text-destructive"
            onClick={async () => {
              await logout()
              navigate('/')
            }}
          >
            <LogOut className="mr-1 h-4 w-4" aria-hidden /> Sign out
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">{children}</div>
        <div className="mt-6 flex gap-3 lg:hidden">
          <Button variant="outline" size="sm" onClick={() => navigate('/')}><ArrowLeft className="mr-1 h-4 w-4" /> Public site</Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={async () => {
              await logout()
              navigate('/')
            }}
          >
            <LogOut className="mr-1 h-4 w-4" /> Sign out
          </Button>
        </div>
      </main>
    </div>
  )
}

/** Guard helper for workspace subpages. */
export function RequirePermission({ permission, children }: { permission: string | null; children: React.ReactNode }) {
  const { loading, authenticated, permissions } = useAuth()
  useEffect(() => {
    if (!loading && !authenticated) navigate('/auth/login')
  }, [loading, authenticated])
  if (loading || !authenticated) return <PageLoader />
  if (permission && !permissions.includes(permission)) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-8 text-center">
        <h2 className="text-lg font-semibold text-destructive">Permission required</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your account does not include <code className="rounded bg-muted px-1">{permission}</code>. If you believe this is a mistake, contact a club administrator.
        </p>
      </div>
    )
  }
  return <>{children}</>
}

export { api }
