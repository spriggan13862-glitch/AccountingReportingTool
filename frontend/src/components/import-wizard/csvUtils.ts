/**
 * Parse a CSV string into headers + rows.
 * Handles quoted fields with embedded commas and newlines.
 */
export function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = splitLines(text)
  if (lines.length === 0) return { headers: [], rows: [] }

  const headers = parseRow(lines[0])
  const rows = lines.slice(1).filter((l) => l.trim()).map((line) => {
    const values = parseRow(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = values[i] ?? '' })
    return row
  })

  return { headers, rows }
}

function splitLines(text: string): string[] {
  const lines: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { current += '"'; i++; continue }
      inQuotes = !inQuotes
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++
      lines.push(current)
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) lines.push(current)
  return lines
}

function parseRow(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; continue }
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim())
      current = ''
      continue
    } else {
      current += ch
    }
  }
  fields.push(current.trim())
  return fields
}

/**
 * Auto-suggest column mappings based on fuzzy header matching.
 * Returns { sourceHeader -> targetField } for confident matches.
 */
export function autoSuggestMappings(
  headers: string[],
  targetFields: { key: string; aliases?: string[] }[]
): Record<string, string> {
  const suggestions: Record<string, string> = {}
  for (const header of headers) {
    const normalized = header.toLowerCase().replace(/[^a-z0-9]/g, '')
    for (const field of targetFields) {
      const candidates = [field.key, ...(field.aliases ?? [])]
      if (candidates.some((c) => c.toLowerCase().replace(/[^a-z0-9]/g, '') === normalized)) {
        suggestions[header] = field.key
        break
      }
    }
  }
  return suggestions
}

/**
 * Read a File as text (UTF-8).
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target?.result as string)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file, 'utf-8')
  })
}
