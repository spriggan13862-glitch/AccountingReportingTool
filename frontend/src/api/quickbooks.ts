import api from './client'

export interface QBConnection {
  id: number
  entity_id: number
  organization_id: number
  connection_type: string
  realm_id: string | null
  company_name: string | null
  status: string
  last_sync_at: string | null
  created_at: string
}

export interface PullRequest {
  pull_type: 'coa' | 'trial_balance' | 'pl' | 'bs' | 'all'
  year: number
  month: number
}

export interface PullResult {
  pull_type: string
  summary: Record<string, unknown>
}

export const quickbooksApi = {
  getConnectUrl: (entityId: number, orgId: number) =>
    api
      .get<{ oauth_url: string }>('/quickbooks/connect', {
        params: { entity_id: entityId, org_id: orgId },
      })
      .then((r) => r.data),

  listConnections: (entityId?: number) =>
    api
      .get<QBConnection[]>('/quickbooks/connections', {
        params: entityId ? { entity_id: entityId } : undefined,
      })
      .then((r) => r.data),

  disconnect: (connId: number) =>
    api.delete(`/quickbooks/connections/${connId}`).then(() => undefined),

  pull: (connId: number, body: PullRequest) =>
    api.post<PullResult>(`/quickbooks/connections/${connId}/pull`, body).then((r) => r.data),

  desktopUpload: (
    file: File,
    params: { entity_id: number; organization_id: number; year: number; month: number }
  ) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('entity_id', String(params.entity_id))
    fd.append('organization_id', String(params.organization_id))
    fd.append('year', String(params.year))
    fd.append('month', String(params.month))
    return api.post<PullResult>('/quickbooks/desktop/upload', fd).then((r) => r.data)
  },
}
