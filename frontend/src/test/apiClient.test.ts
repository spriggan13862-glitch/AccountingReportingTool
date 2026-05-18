import { describe, it, expect, beforeEach } from 'vitest'
import {
  setOrganizationId,
  getOrganizationId,
  setAccessToken,
  getAccessToken,
  clearAuth,
} from '@/api/client'

describe('API client config', () => {
  beforeEach(() => {
    setOrganizationId(null)
    clearAuth()
  })

  it('getOrganizationId returns null initially', () => {
    expect(getOrganizationId()).toBeNull()
  })

  it('setOrganizationId persists the value', () => {
    setOrganizationId(42)
    expect(getOrganizationId()).toBe(42)
  })

  it('setOrganizationId can be cleared', () => {
    setOrganizationId(42)
    setOrganizationId(null)
    expect(getOrganizationId()).toBeNull()
  })

  it('setAccessToken stores the token and getAccessToken retrieves it', () => {
    setAccessToken('test-jwt-token')
    expect(getAccessToken()).toBe('test-jwt-token')
  })

  it('clearAuth removes the token and org', () => {
    setAccessToken('some-token')
    setOrganizationId(1)
    clearAuth()
    expect(getAccessToken()).toBeNull()
    expect(getOrganizationId()).toBeNull()
  })
})
