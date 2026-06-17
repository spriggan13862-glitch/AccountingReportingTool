import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { ApiError } from '@/types'

// In development the Vite proxy rewrites /api → http://localhost:8000/api,
// so relative paths work and CORS preflight is avoided entirely.
// Override with VITE_API_BASE_URL for production or non-proxied environments.
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

// ---------------------------------------------------------------------------
// Organization context (set by OrgProvider)
// ---------------------------------------------------------------------------
let _organizationId: number | null = null

export function setOrganizationId(id: number | null) {
  _organizationId = id
}

export function getOrganizationId(): number | null {
  return _organizationId
}

// ---------------------------------------------------------------------------
// Auth token management (M21: replaces X-User-Id trust model)
// Stored in memory; also persisted to sessionStorage for page refreshes.
// ---------------------------------------------------------------------------
const TOKEN_KEY = 'accounting_access_token'

let _accessToken: string | null = sessionStorage.getItem(TOKEN_KEY)
// Refresh token is intentionally kept only in memory to avoid long-lived storage
let _refreshToken: string | null = null

export function setAccessToken(token: string | null) {
  _accessToken = token
  if (token) {
    sessionStorage.setItem(TOKEN_KEY, token)
  } else {
    sessionStorage.removeItem(TOKEN_KEY)
  }
}

export function setRefreshToken(token: string | null) {
  _refreshToken = token
}

export function getRefreshToken(): string | null {
  return _refreshToken
}

export function clearRefreshToken() {
  _refreshToken = null
}

export function getAccessToken(): string | null {
  return _accessToken
}

export function clearAuth() {
  setAccessToken(null)
  setOrganizationId(null)
}

// Clear both access and refresh tokens
export function clearAllAuth() {
  setAccessToken(null)
  clearRefreshToken()
  setOrganizationId(null)
}

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------
const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Attach org header and Bearer token on every request
api.interceptors.request.use((config) => {
  if (_organizationId !== null) {
    config.headers['X-Organization-Id'] = String(_organizationId)
  }
  if (_accessToken) {
    config.headers['Authorization'] = `Bearer ${_accessToken}`
  }
  return config
})

// Normalise errors; redirect to login on 401
api.interceptors.response.use(
  (res) => res,
  (error: AxiosError<ApiError>) => {
    const originalRequest = (error.config as any) || {}
    const status = error.response?.status

    // Handle 401 by attempting a single refresh flow and retrying original request once.
    if (status === 401 && !originalRequest._retry) {
      const refreshToken = getRefreshToken()
      if (!refreshToken) {
        clearAuth()
        if (window.location.pathname !== '/login') window.location.href = '/login?reason=session_expired'
        return Promise.reject(error)
      }

      // Mark request as retried to prevent loops
      originalRequest._retry = true

      // Call refresh endpoint directly using axios to avoid interceptor recursion
      return axios.post(`${BASE_URL}/auth/refresh`, { refresh_token: refreshToken }, { baseURL: '' })
        .then((r) => {
          const data = r.data as any
          // update tokens
          setAccessToken(data.access_token)
          if (data.refresh_token) setRefreshToken(data.refresh_token)
          // retry original request with new access token
          originalRequest.headers = originalRequest.headers || {}
          if (getAccessToken()) originalRequest.headers['Authorization'] = `Bearer ${getAccessToken()}`
          return api(originalRequest)
        })
        .catch((refreshErr) => {
          // Refresh failed — clear auth and redirect to login
          clearAuth()
          clearRefreshToken()
          if (window.location.pathname !== '/login') window.location.href = '/login?reason=session_expired'
          return Promise.reject(refreshErr)
        })
    }

    const rawDetail = error.response?.data?.detail ?? error.message ?? 'Unknown error'
    // Structured detail objects (e.g. 500 apply_failed) → extract human message
    const detail = typeof rawDetail === 'object' && rawDetail !== null
      ? (rawDetail as Record<string, unknown>).message as string
        ?? (rawDetail as Record<string, unknown>).error as string
        ?? JSON.stringify(rawDetail)
      : String(rawDetail)
    const enriched = new Error(detail) as Error & { apiError: ApiError; status: number; rawDetail: unknown }
    enriched.apiError = error.response?.data ?? { detail }
    enriched.status = error.response?.status ?? 0
    enriched.rawDetail = rawDetail
    return Promise.reject(enriched)
  },
)

export default api
