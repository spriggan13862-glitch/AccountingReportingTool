import { useQuery } from '@tanstack/react-query'
import { Shield, Users, Building2, AlertTriangle, CheckCircle } from 'lucide-react'
import { PageLayout } from '@/components/ui/PageLayout'
import { useOrg } from '@/providers/OrgProvider'
import { useAuth } from '@/providers/AuthProvider'
import { entitiesApi } from '@/api/entities'

interface InfoRowProps { label: string; value: string | number | boolean | null | undefined }
function InfoRow({ label, value }: InfoRowProps) {
  return (
    <div className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-800">{value === null || value === undefined ? '—' : String(value)}</span>
    </div>
  )
}

export function AdminPage() {
  const { org } = useOrg()
  const { user } = useAuth()
  const { data: entityData } = useQuery({
    queryKey: ['entities'],
    queryFn: () => entitiesApi.list(),
    enabled: !!org,
  })

  const entities: any[] = Array.isArray(entityData) ? entityData : (entityData as any)?.items ?? []

  if (!user?.is_superuser && !user?.is_active) {
    return (
      <PageLayout title="Admin">
        <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
          <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-3" />
          <p className="text-sm text-red-700 font-medium">Access Denied</p>
          <p className="text-xs text-red-500 mt-1">You do not have permission to view the admin console.</p>
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title="Admin Console"
      subtitle="Organization, user, and environment management"
    >
      <div className="grid grid-cols-2 gap-4">
        {/* Organization */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="w-4 h-4 text-indigo-500" />
            <h3 className="text-sm font-semibold text-gray-700">Organization</h3>
          </div>
          {org ? (
            <div>
              <InfoRow label="Name" value={org.name} />
              <InfoRow label="ID" value={org.id} />
              <InfoRow label="Slug" value={(org as any).slug} />
              <InfoRow label="Entities" value={entities.length} />
              <InfoRow label="Active entities" value={entities.filter((e) => e.active).length} />
            </div>
          ) : (
            <p className="text-sm text-gray-400">No organization loaded</p>
          )}
        </div>

        {/* Current user */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-indigo-500" />
            <h3 className="text-sm font-semibold text-gray-700">Current User</h3>
          </div>
          {user ? (
            <div>
              <InfoRow label="Name" value={user.full_name} />
              <InfoRow label="Email" value={user.email} />
              <InfoRow label="User ID" value={user.id} />
              <InfoRow label="Superuser" value={user.is_superuser ? 'Yes' : 'No'} />
              <InfoRow label="Active" value={user.is_active ? 'Yes' : 'No'} />
              <InfoRow label="Org ID" value={user.organization_id} />
            </div>
          ) : (
            <p className="text-sm text-gray-400">Not authenticated</p>
          )}
        </div>

        {/* System status */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-indigo-500" />
            <h3 className="text-sm font-semibold text-gray-700">System Status</h3>
          </div>
          <div className="space-y-2">
            {[
              { label: 'API Connection', ok: true },
              { label: 'Authentication', ok: !!user },
              { label: 'Organization Loaded', ok: !!org },
              { label: 'Entity Data', ok: entities.length > 0 },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between py-1">
                <span className="text-sm text-gray-600">{item.label}</span>
                {item.ok
                  ? <CheckCircle className="w-4 h-4 text-green-500" />
                  : <AlertTriangle className="w-4 h-4 text-orange-400" />
                }
              </div>
            ))}
          </div>
        </div>

        {/* Feature flags (placeholder) */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-indigo-500" />
            <h3 className="text-sm font-semibold text-gray-700">Feature Flags</h3>
            <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">placeholder</span>
          </div>
          <div className="space-y-2 text-xs text-gray-500">
            {[
              ['PDF Export', false],
              ['Multi-currency', false],
              ['AI Suggestions', false],
              ['ERP Sync', false],
              ['Demo Mode', true],
            ].map(([label, enabled]) => (
              <div key={String(label)} className="flex justify-between">
                <span>{String(label)}</span>
                <span className={enabled ? 'text-green-600 font-medium' : 'text-gray-400'}>
                  {enabled ? 'enabled' : 'disabled'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Entities table */}
      {entities.length > 0 && (
        <div className="mt-4 bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Entities ({entities.length})</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-2 text-left">ID</th>
                <th className="px-4 py-2 text-left">Code</th>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {entities.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-2 text-gray-400">{e.id}</td>
                  <td className="px-4 py-2 font-mono text-gray-600">{e.code}</td>
                  <td className="px-4 py-2 text-gray-800">{e.name}</td>
                  <td className="px-4 py-2 text-gray-500 capitalize">{e.entity_type}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${e.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {e.active ? 'active' : 'inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageLayout>
  )
}
