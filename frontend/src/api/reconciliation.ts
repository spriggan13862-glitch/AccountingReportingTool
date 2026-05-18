import api from './client'
import type {
  Reconciliation,
  ReconciliationCreate,
  ReconciliationLine,
  ReconciliationUpdateBalances,
  RollforwardScheduleLine,
  SupportReference,
} from '@/types'

export const reconciliationApi = {
  list: (params: {
    organization_id: number
    entity_id?: number
    period_id?: number
    status?: string
  }) =>
    api.get<Reconciliation[]>('/reconciliations', { params }).then((r) => r.data),

  get: (id: number) =>
    api.get<Reconciliation>(`/reconciliations/${id}`).then((r) => r.data),

  create: (body: ReconciliationCreate) =>
    api.post<Reconciliation>('/reconciliations', body).then((r) => r.data),

  updateBalances: (id: number, body: ReconciliationUpdateBalances) =>
    api.patch<Reconciliation>(`/reconciliations/${id}/balances`, body).then((r) => r.data),

  transition: (
    id: number,
    target_status: string,
    user_id?: number | null,
    comment?: string | null,
  ) =>
    api
      .post<Reconciliation>(`/reconciliations/${id}/transition`, {
        target_status,
        user_id,
        comment,
      })
      .then((r) => r.data),

  addLine: (
    recon_id: number,
    body: {
      description?: string
      source_type?: string
      source_reference?: string
      debit?: string
      credit?: string
      is_reconciling_item?: boolean
      reconciling_notes?: string
    },
  ) =>
    api
      .post<ReconciliationLine>(`/reconciliations/${recon_id}/lines`, body)
      .then((r) => r.data),

  getLines: (recon_id: number) =>
    api
      .get<ReconciliationLine[]>(`/reconciliations/${recon_id}/lines`)
      .then((r) => r.data),

  addSupport: (
    recon_id: number,
    body: {
      reference_type: string
      document_id?: number | null
      journal_entry_id?: number | null
      external_ref?: string | null
      description?: string | null
      added_by_user_id?: number | null
    },
  ) =>
    api
      .post<SupportReference>(`/reconciliations/${recon_id}/support`, body)
      .then((r) => r.data),

  getSupport: (recon_id: number) =>
    api
      .get<SupportReference[]>(`/reconciliations/${recon_id}/support`)
      .then((r) => r.data),

  rollforward: (recon_id: number, new_period_id: number, new_official_balance?: string | null) =>
    api
      .post<Reconciliation>(`/reconciliations/${recon_id}/rollforward`, {
        new_period_id,
        new_official_balance,
      })
      .then((r) => r.data),

  cashSchedule: (opening_balance: string, inflows: string, outflows: string) =>
    api
      .post<RollforwardScheduleLine[]>('/reconciliations/schedules/cash', {
        opening_balance,
        inflows,
        outflows,
      })
      .then((r) => r.data),

  reSchedule: (beginning_re: string, net_income: string, dividends?: string) =>
    api
      .post<RollforwardScheduleLine[]>('/reconciliations/schedules/re', {
        beginning_re,
        net_income,
        dividends: dividends ?? '0',
      })
      .then((r) => r.data),

  exportUrl: (id: number) => `/api/v1/reconciliations/${id}/export`,
}
