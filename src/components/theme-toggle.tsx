'use client'

// Night-mode toggle. Intentionally stateless: both icons are always rendered and CSS
// (`dark:hidden` / `hidden dark:block`) decides which one shows — zero hydration
// mismatches, no effect-driven state, works with the pre-hydration boot script in the
// root layout. Clicking reads the live `.dark` class and persists the explicit choice.
import { Moon, Sun } from 'lucide-react'
import { setThemePreference } from '@/lib/theme'

export function ThemeToggle({
  /** 'chrome' = token-based (headers/sidebars that follow the theme); 'dark-panel' = for always-dark chrome (control sidebar). */
  appearance = 'chrome',
  className = '',
}: {
  appearance?: 'chrome' | 'dark-panel'
  className?: string
}) {
  const skin =
    appearance === 'dark-panel'
      ? 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
  return (
    <button
      type="button"
      aria-label="Toggle night mode"
      title="Toggle night mode"
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${skin} ${className}`}
      onClick={() => {
        const dark = document.documentElement.classList.contains('dark')
        setThemePreference(dark ? 'light' : 'dark')
      }}
    >
      {/* Light mode shows the moon (switch to night); dark mode shows the sun (switch to day). */}
      <Sun className="hidden h-[18px] w-[18px] dark:block" aria-hidden />
      <Moon className="h-[18px] w-[18px] dark:hidden" aria-hidden />
    </button>
  )
}
