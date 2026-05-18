import { describe, it, expect, beforeEach } from 'vitest'
import { setOrganizationId, setUserId, getOrganizationId } from '@/api/client'

describe('API client config', () => {
  beforeEach(() => {
    setOrganizationId(null)
    setUserId(null)
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

  it('setUserId does not crash', () => {
    expect(() => setUserId(7)).not.toThrow()
  })
})
