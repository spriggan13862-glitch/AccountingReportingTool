/**
 * Phase C: thin redirect from the deprecated /import/:id and
 * /client-data/imports/:id routes to the canonical wizard URL at
 * /client-data/imports/trial-balance?batchId=:id.
 *
 * Both old URLs continue to work — bookmarks, deep links, and the
 * "Resume Import" navlink on the ImportCenter list still land somewhere
 * useful — but the destination is now the wizard's Review Exceptions
 * step instead of the separate ImportReviewPage screen.
 */
import { useParams, Navigate } from 'react-router-dom'

export function ImportReviewRedirect() {
  const { id } = useParams<{ id: string }>()
  const target = id
    ? `/client-data/imports/trial-balance?batchId=${encodeURIComponent(id)}`
    : '/client-data/imports'
  return <Navigate replace to={target} />
}
