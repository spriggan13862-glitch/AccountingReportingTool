import api from './client'
import type { AdjustmentImpact } from './adjustmentWorkspace'

export type AdvisorScenarioType =
  | 'as_reported'
  | 'management'
  | 'management_tax'
  | 'management_tax_qoe'
  | 'sba'
  | 'custom'

export const ADVISOR_SCENARIO_TYPE_LABELS: Record<AdvisorScenarioType, string> = {
  as_reported: 'As Reported',
  management: 'Management Adjustments',
  management_tax: 'Management + Tax',
  management_tax_qoe: 'Management + Tax + QoE',
  sba: 'SBA Adjusted',
  custom: 'Custom',
}

export const PACKAGE_TYPE_LABELS: Record<string, string> = {
  audit: 'Audit',
  management: 'Management',
  tax: 'Tax',
  qoe: 'QoE',
  seller: 'Seller',
  buyer: 'Buyer',
  sba: 'SBA',
  client_posting: 'Client Posting',
}

export interface AdvisorScenarioPackageItem {
  id: number
  package_id: number
  package_name: string
  package_type: string
  included: boolean
  include_order: number
}

export interface AdvisorScenario {
  id: number
  organization_id: string
  name: string
  scenario_type: AdvisorScenarioType
  description: string | null
  created_at: string
  updated_at: string | null
  packages: AdvisorScenarioPackageItem[]
}

export interface ScenarioImpactResult {
  scenario_id: number
  scenario_name: string
  packages: string[]
  impact: AdjustmentImpact
}

export interface ScenarioComparisonResult {
  scenarios: ScenarioImpactResult[]
}

export async function listAdvisorScenarios(): Promise<AdvisorScenario[]> {
  const res = await api.get<AdvisorScenario[]>('/adjustment-workspace/advisor-scenarios')
  return res.data
}

export async function createAdvisorScenario(data: {
  name: string
  scenario_type: AdvisorScenarioType
  description?: string | null
}): Promise<AdvisorScenario> {
  const res = await api.post<AdvisorScenario>('/adjustment-workspace/advisor-scenarios', data)
  return res.data
}

export async function updateAdvisorScenario(
  id: number,
  data: { name?: string; scenario_type?: AdvisorScenarioType; description?: string | null },
): Promise<AdvisorScenario> {
  const res = await api.put<AdvisorScenario>(`/adjustment-workspace/advisor-scenarios/${id}`, data)
  return res.data
}

export async function deleteAdvisorScenario(id: number): Promise<void> {
  await api.delete(`/adjustment-workspace/advisor-scenarios/${id}`)
}

export async function addPackageToScenario(
  scenarioId: number,
  packageId: number,
  included = true,
  includeOrder = 0,
): Promise<{ added?: boolean; updated?: boolean }> {
  const res = await api.post(`/adjustment-workspace/advisor-scenarios/${scenarioId}/packages`, {
    package_id: packageId,
    included,
    include_order: includeOrder,
  })
  return res.data
}

export async function removePackageFromScenario(
  scenarioId: number,
  packageId: number,
): Promise<void> {
  await api.delete(`/adjustment-workspace/advisor-scenarios/${scenarioId}/packages/${packageId}`)
}

export async function togglePackageInScenario(
  scenarioId: number,
  packageId: number,
  included: boolean,
): Promise<AdvisorScenario> {
  const res = await api.patch<AdvisorScenario>(
    `/adjustment-workspace/advisor-scenarios/${scenarioId}/packages/${packageId}/toggle`,
    { included },
  )
  return res.data
}

export async function compareScenarios(
  scenarioIds: number[],
  entityId: number,
): Promise<ScenarioComparisonResult> {
  const p = new URLSearchParams({ entity_id: String(entityId) })
  scenarioIds.forEach((id) => p.append('scenario_ids', String(id)))
  const res = await api.get<ScenarioComparisonResult>(
    `/adjustment-workspace/advisor-scenarios/compare?${p}`,
  )
  return res.data
}

export function downloadScenarioExport(scenarioId: number, entityId: number): void {
  window.open(
    `/api/v1/adjustment-workspace/advisor-scenarios/${scenarioId}/export?entity_id=${entityId}`,
  )
}
