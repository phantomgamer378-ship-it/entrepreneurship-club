'use client'

// Public site chrome: sticky responsive navbar + footer that sticks to viewport bottom.
import { useState } from 'react'
import { Link2, Menu, X, UserCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import { BrandMark } from '@/components/brand-mark'
import { NewsletterSubscribe } from '@/spa/components/newsletter-subscribe'
import { useAuth } from '@/spa/stores/auth'
import { navigate } from '@/spa/router'

const NAV = [
  { label: 'Home', path: '/' },
  { label: 'About Us', path: '/about' },
  { label: 'Team', path: '/team' },
  { label: 'Events', path: '/events' },
  { label: 'Announcements', path: '/announcements' },
  { label: 'Resources', path: '/resources' },
]

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const { authenticated, user } = useAuth()

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-1 focus:text-primary-foreground">
          Skip to content
        </a>
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4" aria-label="Main navigation">
          <button
            onClick={() => {
              navigate('/')
              setOpen(false)
            }}
            className="flex items-center gap-2 font-bold"
            aria-label="Go to homepage"
          >
            <BrandMark className="h-8 w-8" />
            <span className="hidden sm:inline">Entrepreneurship Club</span>
            <span className="sm:hidden">EC·ADYPU</span>
          </button>

          <div className="hidden items-center gap-1 lg:flex">
            {NAV.map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="hidden items-center gap-2 lg:flex">
            {authenticated ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate('/workspace')}>
                  <UserCircle2 className="mr-1 h-4 w-4" aria-hidden /> {user?.displayName?.split(' ')[0] ?? 'Workspace'}
                </Button>
                <Button size="sm" onClick={() => navigate('/workspace')}>Workspace</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate('/auth/login')}>Sign in</Button>
                <Button size="sm" onClick={() => navigate('/join')}>Join the Club</Button>
              </>
            )}
          </div>

          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button
              className="rounded-md p-2 lg:hidden"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={open ? 'Close menu' : 'Open menu'}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </nav>

        {open ? (
          <div className="border-t bg-background px-4 pb-4 pt-2 lg:hidden">
            {NAV.map((item) => (
              <button
                key={item.path}
                onClick={() => {
                  navigate(item.path)
                  setOpen(false)
                }}
                className="block w-full rounded-md px-3 py-2.5 text-left text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {item.label}
              </button>
            ))}
            <div className="mt-2 flex flex-col gap-2">
              {authenticated ? (
                <Button onClick={() => { navigate('/workspace'); setOpen(false) }}>Open Workspace</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => { navigate('/auth/login'); setOpen(false) }}>Sign in</Button>
                  <Button onClick={() => { navigate('/join'); setOpen(false) }}>Join the Club</Button>
                </>
              )}
            </div>
          </div>
        ) : null}
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="mt-auto border-t bg-muted/40 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2 font-bold">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Link2 className="h-4 w-4 rotate-45" aria-hidden />
              </span>
              Entrepreneurship Club
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              ALTA School of Technology, Ajeenkya DY Patil University, Pune. A student-led community for builders.
            </p>
            <p className="mt-2 text-xs text-muted-foreground/70">[PLACEHOLDER — official address & registration info pending]</p>
          </div>
          <div>
            <h3 className="text-sm font-semibold">Explore</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {NAV.slice(1).map((item) => (
                <li key={item.path}>
                  <button className="hover:text-foreground" onClick={() => navigate(item.path)}>{item.label}</button>
                </li>
              ))}
              <li><button className="hover:text-foreground" onClick={() => navigate('/join')}>Join Club</button></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold">Members</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><button className="hover:text-foreground" onClick={() => navigate('/auth/login')}>Sign in</button></li>
              <li><button className="hover:text-foreground" onClick={() => navigate('/workspace')}>Member workspace</button></li>
              <li><button className="hover:text-foreground" onClick={() => navigate('/control/sign-in')}>Administration</button></li>
            </ul>
            <p className="mt-4 text-xs text-muted-foreground/70">
              © {new Date().getFullYear()} Entrepreneurship Club · ADYPU. [PLACEHOLDER social links]
            </p>
          </div>
          <NewsletterSubscribe />
        </div>
      </footer>
    </div>
  )
}
