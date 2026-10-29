'use client'

// Control panel chrome. Hidden from public navigation; every action inside is still
// enforced server-side — this layout is convenience, not a security boundary.
import { useEffect } from 'react'
import {
  LayoutDashboard, FileText, Users, GraduationCap, ShieldCheck, CalendarDays, Megaphone,
  Mail, Flag, ScrollText, Settings, LogOut, ArrowLeft, Video, Bot,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import { BrandMark } from '@/components/brand-mark'
import { useAuth } from '@/spa/stores/auth'
import { navigate, useHashPath, PageLoader } from '@/spa/router'

const ITEMS = [
  { path: '/control', label: 'Overview', icon: LayoutDashboard, permission: 'dashboard.view' },
  { path: '/control/applications', label: 'Applications', icon: FileText, permission: 'applications.read' },
  { path: '/control/members', label: 'Members', icon: Users, permission: 'members.read' },
  { path: '/control/teachers', label: 'Teachers', icon: GraduationCap, permission: 'members.read' },
  { path: '/control/roles', label: 'Roles & Permissions', icon: ShieldCheck, permission: 'members.read' },
  { path: '/control/meetings', label: 'Meetings', icon: Video, permission: 'video.create.broadcast' },
  { path: '/control/automations', label: 'Automations', icon: Bot, permission: 'automations.read' },
  { path: '/control/events', label: 'Events', icon: CalendarDays, permission: 'events.registrations.read' },
  { path: '/control/announcements', label: 'Announcements', icon: Megaphone, permission: 'announcements.update' },
  { path: '/control/emails', label: 'Email Center', icon: Mail, permission: 'members.read' },
  { path: '/control/moderation', label: 'Moderation', icon: Flag, permission: 'messages.moderate' },
  { path: '/control/audit', label: 'Audit Log', icon: ScrollText, permission: 'audit.read' },
  { path: '/control/settings', label: 'Settings', icon: Settings, permission: 'settings.manage' },
]

export function ControlLayout({ children }: { children: React.ReactNode }) {
  const { loading, authenticated, user, permissions, logout } = useAuth()
  const path = useHashPath()
  const isSignIn = path === '/control/sign-in'

  useEffect(() => {
    if (!loading && !authenticated && !isSignIn) navigate('/control/sign-in')
  }, [loading, authenticated, isSignIn])

  // The sign-in screen lives inside the control route group but must never be
  // gated by authentication — otherwise unauthenticated visitors deadlock on
  // this loader and can never reach the form.
  if (isSignIn) return <div className="min-h-screen bg-zinc-950">{children}</div>

  if (loading || !authenticated || !user) return <PageLoader />

  const allowed = ITEMS.filter((i) => !i.permission || permissions.includes(i.permission))

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="flex shrink-0 flex-col border-b bg-zinc-950 text-zinc-100 lg:min-h-screen lg:w-64 lg:border-b-0">
        <div className="flex items-center justify-between px-4 py-4">
          <button onClick={() => navigate('/control')} className="flex items-center gap-2 font-bold">
            <BrandMark className="h-8 w-8" forceDark />
            <span className="hidden sm:inline">Control Panel</span>
            <span className="sm:hidden">Control</span>
          </button>
          <ThemeToggle appearance="dark-panel" />
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-3 lg:flex-col lg:overflow-visible lg:pb-0" aria-label="Control panel navigation">
          {allowed.map((item) => {
            const active = path === item.path || (item.path !== '/control' && path.startsWith(item.path))
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                aria-current={active ? 'page' : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
                }`}
              >
                <item.icon className="h-4 w-4" aria-hidden />
                {item.label}
              </button>
            )
          })}
        </nav>
        <div className="mt-auto hidden border-t border-zinc-800 p-3 lg:block">
          <div className="mb-2 px-1">
            <p className="truncate text-sm font-medium">{user.displayName}</p>
            <p className="truncate text-xs text-zinc-400">{user.clubRoleLabel ?? user.email}</p>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100" onClick={() => navigate('/workspace')}>
            <LayoutDashboard className="mr-1 h-4 w-4" aria-hidden /> Member workspace
          </Button>
          <Button variant="ghost" size="sm" className="w-full justify-start text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100" onClick={() => navigate('/')}>
            <ArrowLeft className="mr-1 h-4 w-4" aria-hidden /> Public site
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-red-400 hover:bg-zinc-900 hover:text-red-300"
            onClick={async () => {
              await logout()
              navigate('/control/sign-in')
            }}
          >
            <LogOut className="mr-1 h-4 w-4" aria-hidden /> Sign out
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 bg-muted/30 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">{children}</div>
        <div className="mt-6 flex gap-3 lg:hidden">
          <Button variant="outline" size="sm" onClick={() => navigate('/workspace')}><LayoutDashboard className="mr-1 h-4 w-4" /> Workspace</Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/')}><ArrowLeft className="mr-1 h-4 w-4" /> Public site</Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={async () => {
              await logout()
              navigate('/control/sign-in')
            }}
          >
            <LogOut className="mr-1 h-4 w-4" /> Sign out
          </Button>
        </div>
      </main>
    </div>
  )
}
