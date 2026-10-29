// Night-mode theme store. Deliberately NOT a React context: the preference lives in
// localStorage + the `.dark` class on <html>, which keeps the whole thing framework-free,
// SSR-safe and free of hydration mismatches (the toggle renders both icons and lets CSS
// pick the visible one). Consumers read live DOM state on click; UI that needs to react
// to OS-level system changes subscribes via subscribeTheme.
export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'ec-theme'

const listeners = new Set<() => void>()

export function getThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system'
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

/** Applies the resolved theme to <html> (`.dark` class + color-scheme). Idempotent. */
export function applyTheme(preference: ThemePreference = getThemePreference()): void {
  if (typeof document === 'undefined') return
  const resolved = resolveTheme(preference)
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  document.documentElement.style.colorScheme = resolved
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, preference)
  } catch {
    // storage unavailable (private mode etc.) — theme still applies for this session
  }
  applyTheme(preference)
  for (const listener of listeners) listener()
}

// Stay in sync when the preference is 'system' and the OS switches schemes.
if (typeof window !== 'undefined') {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', () => {
    if (getThemePreference() === 'system') {
      applyTheme()
      for (const listener of listeners) listener()
    }
  })
}
