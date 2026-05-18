import { OrgHeader } from '@/components/ui/OrgHeader'
import { UserCircle } from 'lucide-react'

export function TopNav() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4">
      <OrgHeader />
      <button
        type="button"
        className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 transition-colors"
        title="User profile (coming soon)"
      >
        <UserCircle className="h-5 w-5 text-gray-400" />
        <span className="hidden sm:inline">Account</span>
      </button>
    </header>
  )
}
