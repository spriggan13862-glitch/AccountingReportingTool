import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { ApiError } from '@/types'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1'

// Organization context — set via setOrganizationId() before making calls
let _organizationId: number | null = null
// User context — placeholder for future JWT; set via setUserId()
let _userId: number | null = null

export function setOrganizationId(id: number | null) {
  _organizationId = id
}

export function setUserId(id: number | null) {
  _userId = id
}

export function getOrganizationId(): number | null {
  return _organizationId
}

const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Attach org/user headers on every request
api.interceptors.request.use((config) => {
  if (_organizationId !== null) {
    config.headers['X-Organization-Id'] = String(_organizationId)
  }
  if (_userId !== null) {
    // Placeholder for future JWT — backend currently reads X-User-Id
    config.headers['X-User-Id'] = String(_userId)
  }
  return config
})

// Normalise errors to ApiError shape
api.interceptors.response.use(
  (res) => res,
  (error: AxiosError<ApiError>) => {
    const detail = error.response?.data?.detail ?? error.message ?? 'Unknown error'
    const enriched = new Error(detail) as Error & { apiError: ApiError; status: number }
    enriched.apiError = error.response?.data ?? { detail }
    enriched.status = error.response?.status ?? 0
    return Promise.reject(enriched)
  },
)

export default api
