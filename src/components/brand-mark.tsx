'use client'

// Club shield mark extracted from the official logo upload (public/brand/*).
// Two pre-tinted PNGs of the same emblem swap via the `.dark` class — mirroring
// the ThemeToggle pattern so there is no hydration mismatch: light chrome gets
// the near-black mark, night mode gets the white mark. Always-dark surfaces
// (control panel sidebar) pin the white variant with forceDark.
export function BrandMark({
  className = 'h-8 w-8',
  forceDark = false,
}: {
  className?: string
  /** Pin the white mark for always-dark chrome (control panel sidebar). */
  forceDark?: boolean
}) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center ${className}`}>
      <img
        src="/brand/logo-mark.png"
        alt="Entrepreneurship Club shield"
        className={`h-full w-full object-contain ${forceDark ? 'hidden' : 'dark:hidden'}`}
      />
      <img
        src="/brand/logo-mark-white.png"
        alt=""
        aria-hidden
        className={`h-full w-full object-contain ${forceDark ? 'block' : 'hidden dark:block'}`}
      />
    </span>
  )
}
