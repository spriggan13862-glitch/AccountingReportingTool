import { useOrg } from '@/providers/OrgProvider'

export function DemoBanner() {
  const { org } = useOrg()

  if (org?.name !== 'Acme Manufacturing Co.') return null

  return (
    <div className="flex items-center justify-center gap-2 bg-amber-50 px-4 py-1.5 text-xs text-amber-800 border-b border-amber-200">
      <span className="font-semibold">Demo Environment</span>
      <span className="text-amber-600">·</span>
      <span>You are viewing Acme Manufacturing demo data. All users share password <code className="font-mono bg-amber-100 px-1 rounded">Demo1234!</code></span>
    </div>
  )
}
