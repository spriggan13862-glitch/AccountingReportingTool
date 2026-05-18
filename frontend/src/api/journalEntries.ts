import api from './client'
import type { JournalEntry } from '@/types'

export const journalEntriesApi = {
  list: (entityId?: number) =>
    api
      .get<JournalEntry[]>('/journal-entries/', { params: entityId ? { entity_id: entityId } : {} })
      .then((r) => r.data),
  get: (id: number) => api.get<JournalEntry>(`/journal-entries/${id}`).then((r) => r.data),
}
