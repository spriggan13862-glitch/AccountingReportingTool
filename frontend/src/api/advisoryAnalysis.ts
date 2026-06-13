import api from './client'

export interface AdjustmentLineItem {
  je_id: number
  je_number: string
  entry_date: string
  description: string
  overlay_group: string | null
  package_name: string
  package_type: string
  ni_impact: string
  ebitda_impact: string
  asset_impact: string
  liability_impact: string
  equity_impact: string
  amount: string
}

export interface EBITDABridgeSection {
  category: string
  overlay_group: string | null
  items: AdjustmentLineItem[]
  subtotal: string
}

export interface EBITDABridge {
  entity_id: number
  base_ebitda: string
  sections: EBITDABridgeSection[]
  total_adjustments: string
  adjusted_ebitda: string
}

export interface QoESchedule {
  entity_id: number
  items: AdjustmentLineItem[]
  total: string
  count: number
}

export interface SBAAddbackSchedule {
  entity_id: number
  items: AdjustmentLineItem[]
  total: string
  count: number
  note: string
}

export interface DSCRResult {
  entity_id: number
  adjusted_ebitda: string
  annual_debt_service: string
  dscr: string | null
  coverage_note: string
}

function buildParams(
  entityId: number,
  scenarioIds: number[],
  extra?: Record<string, string>,
): URLSearchParams {
  const p = new URLSearchParams({ entity_id: String(entityId) })
  scenarioIds.forEach((id) => p.append('scenario_ids', String(id)))
  if (extra) {
    Object.entries(extra).forEach(([k, v]) => p.set(k, v))
  }
  return p
}

export async function getEBITDABridge(
  entityId: number,
  scenarioIds: number[],
  baseEbitda = 0,
): Promise<EBITDABridge> {
  const p = buildParams(entityId, scenarioIds, { base_ebitda: String(baseEbitda) })
  const res = await api.get<EBITDABridge>(`/advisory-analysis/ebitda-bridge?${p}`)
  return res.data
}

export async function getQoESchedule(
  entityId: number,
  scenarioIds: number[],
): Promise<QoESchedule> {
  const p = buildParams(entityId, scenarioIds)
  const res = await api.get<QoESchedule>(`/advisory-analysis/qoe-schedule?${p}`)
  return res.data
}

export async function getSBAAddback(
  entityId: number,
  scenarioIds: number[],
): Promise<SBAAddbackSchedule> {
  const p = buildParams(entityId, scenarioIds)
  const res = await api.get<SBAAddbackSchedule>(`/advisory-analysis/sba-addback?${p}`)
  return res.data
}

export async function getDSCR(
  entityId: number,
  scenarioIds: number[],
  baseEbitda = 0,
  annualDebtService = 0,
): Promise<DSCRResult> {
  const p = buildParams(entityId, scenarioIds, {
    base_ebitda: String(baseEbitda),
    annual_debt_service: String(annualDebtService),
  })
  const res = await api.get<DSCRResult>(`/advisory-analysis/dscr?${p}`)
  return res.data
}

export function downloadAdvisoryExport(
  entityId: number,
  scenarioIds: number[],
  baseEbitda = 0,
  annualDebtService = 0,
): void {
  const p = buildParams(entityId, scenarioIds, {
    base_ebitda: String(baseEbitda),
    annual_debt_service: String(annualDebtService),
  })
  window.open(`/api/v1/advisory-analysis/export?${p}`)
}
