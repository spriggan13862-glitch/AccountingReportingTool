import api from './client'
import type { Organization } from '@/types'

export async function getOrganization(id: number): Promise<Organization> {
  const { data } = await api.get<Organization>(`/organizations/${id}`)
  return data
}
