import { useFormatNumber } from '@/hooks/useFormatCurrency'

interface FsLine {
  code: string
  name: string
  display_balance: string
  is_subtotal: boolean
  indent_level?: number
}

interface Props {
  lines: FsLine[]
  title: string
  onLineClick?: (code: string) => void
}

export function StatementViewer({ lines, title, onLineClick }: Props) {
  const fmtNumber = useFormatNumber()
  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b">
        <h3 className="font-semibold text-sm text-gray-700">{title}</h3>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {lines.map((line) => (
            <tr
              key={line.code}
              className={`border-b last:border-0 ${line.is_subtotal ? 'bg-gray-50' : 'hover:bg-gray-50'} ${onLineClick ? 'cursor-pointer' : ''}`}
              onClick={() => onLineClick?.(line.code)}
            >
              <td
                className={`px-4 py-2 ${line.is_subtotal ? 'font-semibold' : ''}`}
                style={{ paddingLeft: `${(line.indent_level ?? 0) * 16 + 16}px` }}
              >
                {line.name}
              </td>
              <td className={`px-4 py-2 text-right tabular-nums ${line.is_subtotal ? 'font-semibold' : ''}`}>
                {Number.isFinite(parseFloat(line.display_balance)) ? fmtNumber(parseFloat(line.display_balance)) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
