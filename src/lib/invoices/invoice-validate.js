import { parseMoney } from '@/lib/invoices/invoice-compute-totals'

/**
 * Ensure every billable line has a display name before ZATCA submit / checkout.
 * Buyer-party validation is intentionally omitted — this POS only issues
 * Simplified (B2C) invoices with no customer party.
 *
 * @param {{ lines: Array<{ quantity: number, unitPrice: string, nameAr?: string | null, nameEn?: string | null }> }} parsed
 */
export function assertLinesValidForSend(parsed) {
  for (const line of parsed.lines) {
    const qty = Math.max(0, Math.round(Number(line.quantity)) || 0)
    const up = parseMoney(line.unitPrice)
    const gross = qty * up
    const title =
      String(line.nameAr ?? '').trim() || String(line.nameEn ?? '').trim()
    if (gross > 0 && !title) {
      const err = /** @type {const} */ ({
        code: 'LINE_NAME_REQUIRED',
        message: 'Each billable line must have an item name',
      })
      throw Object.assign(new Error(err.message), err)
    }
  }
}
