import { Building2, ChevronDown } from 'lucide-react'
import { useOrg } from '@/providers/OrgProvider'

export function OrgHeader() {
  const { org } = useOrg()
  return (
    <button
      type="button"
      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
      title="Organization switcher (coming soon)"
    >
      <Building2 className="h-4 w-4 text-gray-400" />
      <span className="max-w-[140px] truncate">{org?.name ?? 'Select org'}</span>
      <ChevronDown className="h-3 w-3 text-gray-400" />
    </button>
  )
}
