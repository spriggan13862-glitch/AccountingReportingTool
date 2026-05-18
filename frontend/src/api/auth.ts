import api from './client'
import type { CurrentUser, TokenResponse } from '@/types'

export async function login(email: string, password: string): Promise<TokenResponse> {
  const { data } = await api.post<TokenResponse>('/auth/login', { email, password })
  return data
}

export async function getMe(): Promise<CurrentUser> {
  const { data } = await api.get<CurrentUser>('/auth/me')
  return data
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout')
}

export async function refreshToken(): Promise<TokenResponse> {
  const { data } = await api.post<TokenResponse>('/auth/refresh')
  return data
}
