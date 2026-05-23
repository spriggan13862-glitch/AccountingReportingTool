import api from './client'
import type { Document } from '@/types'

export const documentsApi = {
  list: (objectType: string, objectId: number) =>
    api
      .get<Document[]>(`/attachments/${objectType}/${objectId}`)
      .then((r) => r.data),
  get: (id: number) => api.get<Document>(`/documents/${id}`).then((r) => r.data),
  download: (id: number) =>
    api
      .get(`/documents/${id}/download`, { responseType: 'blob' })
      .then((r) => {
        const url = window.URL.createObjectURL(new Blob([r.data]))
        const link = document.createElement('a')
        link.href = url
        const disposition = r.headers['content-disposition']
        let filename = 'download'
        if (disposition && disposition.indexOf('attachment') !== -1) {
          const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/
          const matches = filenameRegex.exec(disposition)
          if (matches != null && matches[1]) {
            filename = matches[1].replace(/['"]/g, '')
          }
        }
        link.setAttribute('download', filename)
        document.body.appendChild(link)
        link.click()
        link.remove()
      }),
}
