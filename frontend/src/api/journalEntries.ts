import api from './client'
import type { JECreate, JournalEntry, PagedResponse, ReverseJERequest } from '@/types'

export const journalEntriesApi = {
  // Queries
  list: (params?: { entity_id?: number; status?: string; page?: number; page_size?: number }) =>
    api
      .get<PagedResponse<JournalEntry>>('/journal-entries/', { params })
      .then((r) => r.data.items ?? []),

  get: (id: number) => api.get<JournalEntry>(`/journal-entries/${id}`).then((r) => r.data),

  // Mutations
  createAndPost: (data: JECreate) =>
    api.post<JournalEntry>('/journal-entries/', data).then((r) => r.data),

  createDraft: (data: JECreate) =>
    api.post<JournalEntry>('/journal-entries/draft', data).then((r) => r.data),

  updateDraft: (id: number, data: JECreate) =>
    api.put<JournalEntry>(`/journal-entries/${id}`, data).then((r) => r.data),

  postDraft: (id: number) =>
    api.post<JournalEntry>(`/journal-entries/${id}/post`).then((r) => r.data),

  deleteDraft: (id: number) =>
    api.delete(`/journal-entries/${id}/draft`).then(() => undefined),

  reverse: (id: number, data: ReverseJERequest) =>
    api.post<JournalEntry>(`/journal-entries/${id}/reverse`, data).then((r) => r.data),

  importCsv: (entityId: number, file: File, scenarioId?: number, overlayGroup?: string, isReversing?: boolean) => {
    const form = new FormData()
    form.append('entity_id', String(entityId))
    if (scenarioId !== undefined) {
      form.append('scenario_id', String(scenarioId))
    }
    if (overlayGroup !== undefined) {
      form.append('overlay_group', overlayGroup)
    }
    if (isReversing !== undefined) {
      form.append('is_reversing', String(isReversing))
    }
    form.append('file', file)
    return api.post<{ success: boolean; message: string; imported_count: number }>('/journal-entries/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data)
  },
}
