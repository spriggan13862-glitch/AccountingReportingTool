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

export function setAccessToken(token: string | null) {
  _accessToken = token
  if (token) {
    sessionStorage.setItem(TOKEN_KEY, token)
  } else {
    sessionStorage.removeItem(TOKEN_KEY)
  }
}

export function getAccessToken(): string | null {
  return _accessToken
}

export function clearAuth() {
  setAccessToken(null)
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
    if (error.response?.status === 401) {
      // Token expired or invalid — clear auth state and reload to login
      clearAuth()
      if (window.location.pathname !== '/login') {
        window.location.href = '/login?reason=session_expired'
      }
    }
    const detail = error.response?.data?.detail ?? error.message ?? 'Unknown error'
    const enriched = new Error(detail) as Error & { apiError: ApiError; status: number }
    enriched.apiError = error.response?.data ?? { detail }
    enriched.status = error.response?.status ?? 0
    return Promise.reject(enriched)
  },
)

export default api
