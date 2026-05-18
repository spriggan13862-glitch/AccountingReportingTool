import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Organization } from '@/types'
import { setOrganizationId } from '@/api/client'

interface OrgContextValue {
  org: Organization | null
  setOrg: (org: Organization | null) => void
}

const OrgContext = createContext<OrgContextValue>({ org: null, setOrg: () => {} })

export function OrgProvider({ children }: { children: ReactNode }) {
  const [org, setOrgState] = useState<Organization | null>(null)

  function setOrg(next: Organization | null) {
    setOrgState(next)
    setOrganizationId(next?.id ?? null)
  }

  return <OrgContext.Provider value={{ org, setOrg }}>{children}</OrgContext.Provider>
}

export function useOrg() {
  return useContext(OrgContext)
}
