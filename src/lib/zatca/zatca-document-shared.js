import { computeLineAmounts } from '@/lib/invoices/invoice-compute-totals'

/** @param {number} n */
export function round2(n) {
  return Math.round(n * 100) / 100
}

/**
 * @param {Date} date
 */
export function riyadhIssueParts(date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  /** @type {Record<string, string>} */
  const parts = {}
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = p.value
  }
  return {
    issueDate: `${parts.year}-${parts.month}-${parts.day}`,
    issueTime: `${parts.hour}:${parts.minute}:${parts.second}`,
  }
}

/**
 * @param {{ vatPreset: string }} line
 */
export function vatPresetToTax(line) {
  if (line.vatPreset === 'zero') return { taxCategoryId: 'Z', taxPercent: 0 }
  if (line.vatPreset === 'exempt') return { taxCategoryId: 'E', taxPercent: 0 }
  return { taxCategoryId: 'S', taxPercent: 15 }
}

/**
 * @param {Array<{
 *   quantity: number
 *   unitPrice: string
 *   discount?: string
 *   vatPreset: string
 * }>} lines
 */
export function buildTaxSubtotals(lines) {
  /** @type {Map<string, { taxableAmount: number, taxAmount: number, percent: number, taxCategoryId: string }>} */
  const groups = new Map()
  for (const line of lines) {
    const amounts = computeLineAmounts(line)
    const { taxCategoryId, taxPercent } = vatPresetToTax(line)
    const key = `${taxCategoryId}:${taxPercent}`
    const prev = groups.get(key) ?? {
      taxableAmount: 0,
      taxAmount: 0,
      percent: taxPercent,
      taxCategoryId,
    }
    prev.taxableAmount += amounts.taxable
    prev.taxAmount += amounts.vatAmount
    groups.set(key, prev)
  }
  return [...groups.values()].map((g) => ({
    taxableAmount: round2(g.taxableAmount),
    taxAmount: round2(g.taxAmount),
    percent: g.percent,
    taxCategoryId: /** @type {import('@talha7k/zatca').TaxCategoryId} */ (
      g.taxCategoryId
    ),
  }))
}
