import { parseMoney } from '@/lib/invoices/invoice-compute-totals'

/**
 * Highest normal unit price (ex-VAT) an item can have inside a deal: base price
 * plus, for every variant group, the most expensive option the deal allows.
 * A group with no allowed option picked on the deal is unrestricted, so its
 * most expensive option counts. Extras are never part of a deal.
 *
 * Pure (client + server) — the admin form preview and the server's
 * "deal must be cheaper" check use the same number.
 *
 * @param {{
 *   price?: string | number | null
 *   variantGroups?: Array<{ options?: Array<{ id: string, priceChange?: string | number | null }> }>
 * }} menuItem
 * @param {string[] | null | undefined} allowedOptionIds
 */
export function highestDealUnitPrice(menuItem, allowedOptionIds) {
  let price = parseMoney(menuItem?.price)
  const allowed = new Set(allowedOptionIds ?? [])
  for (const group of menuItem?.variantGroups ?? []) {
    const options = group.options ?? []
    const picked = options.filter((o) => allowed.has(o.id))
    const pool = picked.length > 0 ? picked : options
    if (pool.length === 0) continue
    price += Math.max(...pool.map((o) => parseMoney(o.priceChange)))
  }
  return price
}

/**
 * Normal total of one deal box at the highest allowed prices (the most a
 * customer can save). Null when an item is missing.
 *
 * @param {Array<{ menuItemId: string, quantity: number, variantOptionIds?: string[] }>} items
 * @param {Map<string, any>} menuItemById
 */
export function comboHighestNormalTotal(items, menuItemById) {
  let sum = 0
  for (const it of items) {
    const menuItem = menuItemById.get(it.menuItemId)
    const qty = Number(it.quantity)
    if (!menuItem || !Number.isFinite(qty) || qty < 1) return null
    sum += highestDealUnitPrice(menuItem, it.variantOptionIds) * qty
  }
  return items.length > 0 ? Math.round(sum * 100) / 100 : null
}
