import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { setAccessTokenGetter, api } from '../services/api'
import { useNavigate } from 'react-router-dom'


const TOKEN_KEY = 'volunteerloop_access_token'
const IdentityContext = createContext(null)

export function IdentityProvider({ children }) {
  const navigate = useNavigate()
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '')
  const [profile, setProfile] = useState(null)
  const [isLoading, setIsLoading] = useState(Boolean(localStorage.getItem(TOKEN_KEY)))

  useEffect(() => {
    setAccessTokenGetter(token ? async () => token : null)
  }, [token])

  useEffect(() => {
    let alive = true
    if (!token) {
      setProfile(null)
      setIsLoading(false)
      return () => { alive = false }
    }
    setIsLoading(true)
    api.getMe()
      .then((p) => { if (alive) setProfile(p) })
      .catch(() => {
        if (alive) {
          localStorage.removeItem(TOKEN_KEY)
          setToken('')
          setProfile(null)
        }
      })
      .finally(() => { if (alive) setIsLoading(false) })
    return () => { alive = false }
  }, [token])

  const acceptAuth = useCallback((result) => {
    localStorage.setItem(TOKEN_KEY, result.access_token)
    setAccessTokenGetter(async () => result.access_token)
    setToken(result.access_token)
    setProfile(result.user)
    return result.user
  }, [])

  const register = useCallback(async (payload) => acceptAuth(await api.signup(payload)), [acceptAuth])
  const authenticate = useCallback(async (payload) => acceptAuth(await api.login(payload)), [acceptAuth])
  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setAccessTokenGetter(null)
    setToken('')
    setProfile(null)
    navigate('/', { replace: true })
  }, [navigate])
  // Existing pages call login() when a guest tries a protected action.
  const login = useCallback(() => navigate('/login'), [navigate])

  const identity = profile ? {
    studentId: profile.sub || profile.id,
    studentName: profile.name || profile.email || 'Volunteer',
    email: profile.email,
    roles: profile.roles || ['student'],
    interests: profile.interests || [],
  } : null
  const value = useMemo(() => ({
    identity,
    profile,
    isAuthenticated: Boolean(token && profile),
    isLoading,
    login,
    authenticate,
    register,
    logout,
    clearIdentity: logout,
    setIdentity: setProfile,
  }), [identity, profile, token, isLoading, login, authenticate, register, logout])

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>
}

export function useIdentity() {
  const ctx = useContext(IdentityContext)
  if (!ctx) throw new Error('useIdentity must be used inside <IdentityProvider>')
  return ctx
}
