'use client'

// Auth context: session state, permissions for UI visibility only.
// All authorization is enforced server-side; these values only drive cosmetic UI.
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { api, clearToken } from '@/spa/api/client'

export type SessionUser = {
  id: string
  email: string
  fullName: string
  username: string | null
  displayName: string
  avatarUrl: string | null
  clubRoleLabel: string | null
}

export type SessionResponse = {
  authenticated: boolean
  user?: SessionUser
  roles?: string[]
  permissions?: string[]
}

export type AuthState = {
  loading: boolean
  authenticated: boolean
  user: SessionUser | null
  roles: string[]
  permissions: string[]
  /** Fetches the session and also RETURNS it, so callers that just changed auth
   *  state (e.g. right after login) can route on fresh data instead of the stale
   *  hook closure from the previous render. */
  refresh: () => Promise<SessionResponse | null>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  loading: true,
  authenticated: false,
  user: null,
  roles: [],
  permissions: [],
  refresh: async () => null,
  logout: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<AuthState, 'refresh' | 'logout'>>({
    loading: true,
    authenticated: false,
    user: null,
    roles: [],
    permissions: [],
  })

  const refresh = useCallback(async (): Promise<SessionResponse | null> => {
    try {
      const data = await api.get<SessionResponse>('/api/auth/session')
      setState({
        loading: false,
        authenticated: data.authenticated,
        user: data.user ?? null,
        roles: data.roles ?? [],
        permissions: data.permissions ?? [],
      })
      return data
    } catch {
      setState({ loading: false, authenticated: false, user: null, roles: [], permissions: [] })
      return null
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout')
    } finally {
      clearToken()
      setState({ loading: false, authenticated: false, user: null, roles: [], permissions: [] })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <AuthContext.Provider
      value={{
        ...state,
        refresh,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

export function useHasPermission(permission: string): boolean {
  const { permissions } = useAuth()
  return permissions.includes(permission)
}
