import { useQuery } from '@tanstack/react-query'
import { reportingSettingsApi } from '@/api/reportingSettings'
import { formatCurrency, formatNumber, type FormatOptions } from '@/lib/format'

function useReportingSettings() {
  const { data } = useQuery({
    queryKey: ['reporting-settings'],
    queryFn: () => reportingSettingsApi.get(),
    staleTime: 5 * 60 * 1000,
  })
  return data
}

export function useFormatCurrency() {
  const settings = useReportingSettings()
  return (value: number | null | undefined, overrides: FormatOptions = {}) =>
    formatCurrency(value, {
      decimals: settings?.decimal_places ?? 0,
      symbol: settings?.currency_symbol ?? '$',
      negativeFormat: (settings?.negative_format ?? 'parentheses') as 'parentheses' | 'minus',
      ...overrides,
    })
}

export function useFormatNumber() {
  const settings = useReportingSettings()
  return (value: number | null | undefined) =>
    formatNumber(value, settings?.decimal_places ?? 0)
}
