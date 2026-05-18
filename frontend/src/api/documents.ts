import api from './client'
import type { Document } from '@/types'

export const documentsApi = {
  list: (objectType: string, objectId: number) =>
    api
      .get<Document[]>(`/attachments/${objectType}/${objectId}`)
      .then((r) => r.data),
  get: (id: number) => api.get<Document>(`/documents/${id}`).then((r) => r.data),
}
