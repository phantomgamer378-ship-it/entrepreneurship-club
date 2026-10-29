'use client'

// SPA root: providers + route table. Public, auth, workspace and control views all
// live under hash routes; workspace/control routes are lazy-loaded (§15 performance).
import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/spa/stores/auth'
import { Router, lazyPage, useHashPath, navigate } from '@/spa/router'
import { PublicLayout } from '@/spa/layouts/public-layout'
import { WorkspaceLayout } from '@/spa/layouts/workspace-layout'
import { ControlLayout } from '@/spa/layouts/control-layout'

// Public pages
const Home = lazyPage(() => import('@/spa/pages/public/home'))
const About = lazyPage(() => import('@/spa/pages/public/about'))
const Team = lazyPage(() => import('@/spa/pages/public/team'))
const MemberProfile = lazyPage(() => import('@/spa/pages/public/member-profile'))
const Events = lazyPage(() => import('@/spa/pages/public/events'))
const EventDetail = lazyPage(() => import('@/spa/pages/public/event-detail'))
const Announcements = lazyPage(() => import('@/spa/pages/public/announcements'))
const AnnouncementDetail = lazyPage(() => import('@/spa/pages/public/announcement-detail'))
const Resources = lazyPage(() => import('@/spa/pages/public/resources'))
const Join = lazyPage(() => import('@/spa/pages/public/join'))
const NotFound = lazyPage(() => import('@/spa/pages/public/not-found'))

// Auth pages
const Login = lazyPage(() => import('@/spa/pages/auth/login'))
const AcceptInvite = lazyPage(() => import('@/spa/pages/auth/accept-invite'))
const ForgotPassword = lazyPage(() => import('@/spa/pages/auth/forgot-password'))
const ResetPassword = lazyPage(() => import('@/spa/pages/auth/reset-password'))

// Workspace pages
const WorkspaceDashboard = lazyPage(() => import('@/spa/pages/workspace/dashboard'))
const WorkspaceProfile = lazyPage(() => import('@/spa/pages/workspace/profile'))
const Messages = lazyPage(() => import('@/spa/pages/workspace/messages'))
const Meetings = lazyPage(() => import('@/spa/pages/workspace/meetings'))
const MeetingRoom = lazyPage(() => import('@/spa/pages/workspace/meeting-room'))
const Notifications = lazyPage(() => import('@/spa/pages/workspace/notifications'))
const VoiceLounge = lazyPage(() => import('@/spa/pages/workspace/voice'))

// Control pages
const ControlSignIn = lazyPage(() => import('@/spa/pages/control/sign-in'))
const ControlOverview = lazyPage(() => import('@/spa/pages/control/overview'))
const ControlMeetings = lazyPage(() => import('@/spa/pages/control/meetings'))
const ControlAutomations = lazyPage(() => import('@/spa/pages/control/automations'))
const ControlApplications = lazyPage(() => import('@/spa/pages/control/applications'))
const ControlMembers = lazyPage(() => import('@/spa/pages/control/members'))
const ControlTeachers = lazyPage(() => import('@/spa/pages/control/teachers'))
const ControlRoles = lazyPage(() => import('@/spa/pages/control/roles'))
const ControlEvents = lazyPage(() => import('@/spa/pages/control/events'))
const ControlAnnouncements = lazyPage(() => import('@/spa/pages/control/announcements'))
const ControlEmails = lazyPage(() => import('@/spa/pages/control/emails'))
const ControlModeration = lazyPage(() => import('@/spa/pages/control/moderation'))
const ControlAudit = lazyPage(() => import('@/spa/pages/control/audit'))
const ControlSettings = lazyPage(() => import('@/spa/pages/control/settings'))

const PUBLIC_ROUTES = [
  { pattern: '', component: Home }, // empty hash = home
  { pattern: 'about', component: About },
  { pattern: 'team', component: Team },
  { pattern: 'members/:username', component: MemberProfile },
  { pattern: 'events', component: Events },
  { pattern: 'events/:slug', component: EventDetail },
  { pattern: 'announcements', component: Announcements },
  { pattern: 'announcements/:id', component: AnnouncementDetail },
  { pattern: 'resources', component: Resources },
  { pattern: 'join', component: Join },
]

const AUTH_ROUTES = [
  { pattern: 'auth/login', component: Login },
  { pattern: 'auth/accept-invite', component: AcceptInvite },
  { pattern: 'auth/forgot-password', component: ForgotPassword },
  { pattern: 'auth/reset-password', component: ResetPassword },
]

const WORKSPACE_ROUTES = [
  { pattern: 'workspace/profile', component: WorkspaceProfile },
  { pattern: 'workspace/messages', component: Messages },
  { pattern: 'workspace/meetings', component: Meetings },
  { pattern: 'workspace/meet/:roomId', component: MeetingRoom },
  { pattern: 'workspace/notifications', component: Notifications },
  { pattern: 'workspace/voice', component: VoiceLounge },
  { pattern: 'workspace', component: WorkspaceDashboard },
]

const CONTROL_ROUTES = [
  { pattern: 'control/sign-in', component: ControlSignIn },
  { pattern: 'control/meetings', component: ControlMeetings },
  { pattern: 'control/automations', component: ControlAutomations },
  { pattern: 'control/applications', component: ControlApplications },
  { pattern: 'control/members', component: ControlMembers },
  { pattern: 'control/teachers', component: ControlTeachers },
  { pattern: 'control/roles', component: ControlRoles },
  { pattern: 'control/events', component: ControlEvents },
  { pattern: 'control/announcements', component: ControlAnnouncements },
  { pattern: 'control/emails', component: ControlEmails },
  { pattern: 'control/moderation', component: ControlModeration },
  { pattern: 'control/audit', component: ControlAudit },
  { pattern: 'control/settings', component: ControlSettings },
  { pattern: 'control', component: ControlOverview },
]

function queryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 15_000, refetchOnWindowFocus: false } },
  })
}

function Shell() {
  const path = useHashPath()
  useEffect(() => {
    // Scroll to top on navigation; keep home route clean.
    window.scrollTo({ top: 0 })
  }, [path])

  const clean = path.split('?')[0]
  const isAuth = AUTH_ROUTES.some((r) => matchPrefix(r.pattern, clean))
  const isWorkspace = WORKSPACE_ROUTES.some((r) => matchPrefix(r.pattern, clean))
  const isControl = CONTROL_ROUTES.some((r) => matchPrefix(r.pattern, clean))

  if (isAuth) {
    return <Router routes={AUTH_ROUTES} fallback={NotFound} />
  }
  if (isWorkspace) {
    return (
      <WorkspaceLayout>
        <Router routes={WORKSPACE_ROUTES} fallback={NotFound} />
      </WorkspaceLayout>
    )
  }
  if (isControl) {
    return (
      <ControlLayout>
        <Router routes={CONTROL_ROUTES} fallback={NotFound} />
      </ControlLayout>
    )
  }
  return (
    <PublicLayout>
      <Router routes={PUBLIC_ROUTES} fallback={NotFound} />
    </PublicLayout>
  )
}

function matchPrefix(pattern: string, path: string): boolean {
  const p = pattern.split('/').filter(Boolean)
  const a = path.split('/').filter(Boolean)
  if (p.length !== a.length) return false
  for (let i = 0; i < p.length; i++) {
    if (!p[i].startsWith(':') && p[i] !== a[i]) return false
  }
  return true
}

export function SpaApp() {
  return (
    <QueryClientProvider client={queryClient()}>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </QueryClientProvider>
  )
}

export { navigate }
