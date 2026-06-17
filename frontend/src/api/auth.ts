import api from './client'
import type { CurrentUser, TokenResponse } from '@/types'
import { setRefreshToken } from './client'

export async function login(email: string, password: string): Promise<TokenResponse> {
  const { data } = await api.post<TokenResponse>('/auth/login', { email, password })
  // Persist refresh token in memory
  if (data.refresh_token) setRefreshToken(data.refresh_token)
  return data
}

export async function getMe(): Promise<CurrentUser> {
  const { data } = await api.get<CurrentUser>('/auth/me')
  return data
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout')
}

export async function logoutRefresh(): Promise<void> {
  await api.post('/auth/logout-refresh')
}

export async function refreshToken(): Promise<TokenResponse> {
  const { data } = await api.post<TokenResponse>('/auth/refresh')
  if (data.refresh_token) setRefreshToken(data.refresh_token)
  return data
}
