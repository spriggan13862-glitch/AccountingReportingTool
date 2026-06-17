import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { getMe, login as apiLogin, logout as apiLogout, logoutRefresh as apiLogoutRefresh } from '@/api/auth'
import { clearAuth, getAccessToken, setAccessToken, setOrganizationId, getRefreshToken, clearAllAuth } from '@/api/client'
import type { CurrentUser } from '@/types'

interface AuthContextValue {
  user: CurrentUser | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => {},
  logout: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [token, setToken] = useState<string | null>(getAccessToken())
  const [isLoading, setIsLoading] = useState(true)

  // On mount, if a token exists in sessionStorage, validate it by fetching /me
  useEffect(() => {
    const storedToken = getAccessToken()
    if (!storedToken) {
      setIsLoading(false)
      return
    }
    getMe()
      .then((u) => {
        setUser(u)
        setOrganizationId(u.organization_id)
      })
      .catch(() => {
        // Token invalid or expired — clear it
        clearAuth()
        setToken(null)
        setUser(null)
      })
      .finally(() => setIsLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const tokenResp = await apiLogin(email, password)
    setAccessToken(tokenResp.access_token)
    setToken(tokenResp.access_token)
    const me = await getMe()
    setUser(me)
    setOrganizationId(me.organization_id)
  }, [])

  const logout = useCallback(async () => {
    try {
      // If a refresh token exists, call logout-refresh endpoint on the backend
      // to ensure server-side refresh revocation. Otherwise call the generic logout.
      if (getRefreshToken()) {
        try {
          await apiLogoutRefresh()
        } catch {
          // best-effort
        }
      } else {
        try {
          await apiLogout()
        } catch {
          // best-effort
        }
      }
    } catch {
      // best-effort — always clear local state
    }
    clearAllAuth()
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user,
        login,
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
