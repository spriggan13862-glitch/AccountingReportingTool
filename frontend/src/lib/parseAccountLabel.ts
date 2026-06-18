/**
 * Split a combined account label into account_number and account_name.
 *
 * Handles common separators used in trial balance exports:
 *   "1000 Cash"        → { account_number: "1000", account_name: "Cash" }
 *   "1000 - Cash"      → { account_number: "1000", account_name: "Cash" }
 *   "1000: Cash"       → { account_number: "1000", account_name: "Cash" }
 *   "1000.Cash"        → { account_number: "1000", account_name: "Cash" }
 *   "1000 · Cash"      → { account_number: "1000", account_name: "Cash" }
 *   "1000 — Cash"      → { account_number: "1000", account_name: "Cash" }
 *   "Cash"             → { account_number: null,   account_name: "Cash" }
 *   "1000"             → { account_number: "1000", account_name: null }
 */
export function parseAccountLabel(input: string): {
  account_number: string | null
  account_name: string | null
} {
  if (!input || !input.trim()) {
    return { account_number: null, account_name: null }
  }

  const s = input.trim()

  // Pattern: leading alphanumeric code (may include dots/dashes within the code)
  // followed by a separator, followed by the name.
  // Separators: space, " - ", ": ", ".", " · ", " — ", " – "
  // Account numbers must start with a digit (e.g. "1000", "4500-01", "10.1")
  const match = s.match(
    /^(\d[A-Za-z0-9]*(?:[.\-][0-9]+)*)\s*(?:[-–—·:.]|\s)\s*(.+)$/
  )

  if (match) {
    const [, num, name] = match
    return {
      account_number: num.trim() || null,
      account_name: name.trim() || null,
    }
  }

  // Pure number with no name (must start with digit)
  if (/^\d[A-Za-z0-9]*(?:[.\-][0-9]+)*$/.test(s)) {
    return { account_number: s, account_name: null }
  }

  // Pure name with no number
  return { account_number: null, account_name: s }
}
