const { randomUUID } = require('node:crypto')
const {
  canConvertUnits,
  convertStockQty,
  formatQtyString,
  normalizeQtyString,
  parseQty,
} = require('./units.cjs')
const { enqueueOutbox } = require('../pos/outbox.cjs')

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} businessProfileId
 * @param {string[]} menuItemIds
 */
function loadRecipesMap(db, businessProfileId, menuItemIds) {
  const ids = [...new Set(menuItemIds.filter(Boolean))]
  /** @type {Map<string, { ingredients: any[] }>} */
  const map = new Map()
  if (ids.length === 0) return map

  const placeholders = ids.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT menu_item_id, payload_json FROM menu_item_recipes
       WHERE business_profile_id = ? AND menu_item_id IN (${placeholders})`,
    )
    .all(businessProfileId, ...ids)

  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload_json || '{}')
      map.set(row.menu_item_id, {
        ingredients: Array.isArray(payload.ingredients) ? payload.ingredients : [],
      })
    } catch {
      map.set(row.menu_item_id, { ingredients: [] })
    }
  }
  return map
}

/**
 * @param {Array<{ menuItemId?: string | null, quantity?: number }>} lines
 * @param {Map<string, { ingredients: any[] }>} recipesByMenuItemId
 */
function aggregateRecipeStockNeeds(lines, recipesByMenuItemId) {
  /** @type {Map<string, { stockItem: any, requiredInItemUnit: number }>} */
  const byStock = new Map()

  for (const line of lines) {
    const menuItemId = line?.menuItemId
    if (!menuItemId) continue
    const qty = Number.parseInt(String(line.quantity ?? 0), 10) || 0
    if (qty <= 0) continue
    const recipe = recipesByMenuItemId.get(menuItemId)
    if (!recipe?.ingredients?.length) continue

    for (const ing of recipe.ingredients) {
      const stock = ing.stockItem
      if (!stock?.id) continue
      if (stock.active === false) continue
      if (!canConvertUnits(ing.unit, stock.unit)) continue

      const perServing = parseQty(ing.quantity) ?? 0
      if (perServing <= 0) continue

      let inStockUnit = perServing * qty
      if (ing.unit !== stock.unit) {
        inStockUnit =
          parseQty(
            convertStockQty(formatQtyString(perServing * qty), ing.unit, stock.unit),
          ) ?? 0
      }

      const prev = byStock.get(stock.id)
      if (prev) {
        prev.requiredInItemUnit += inStockUnit
      } else {
        byStock.set(stock.id, {
          stockItem: stock,
          requiredInItemUnit: inStockUnit,
        })
      }
    }
  }

  const needs = []
  const shortfalls = []
  for (const { stockItem, requiredInItemUnit } of byStock.values()) {
    const required = formatQtyString(requiredInItemUnit)
    const onHand = normalizeQtyString(stockItem.quantityOnHand ?? '0')
    const onHandN = parseQty(onHand) ?? 0
    const short = requiredInItemUnit - onHandN
    const row = {
      stockItemId: stockItem.id,
      nameAr: stockItem.nameAr,
      nameEn: stockItem.nameEn,
      unit: stockItem.unit,
      required,
      onHand,
      shortfall: short > 0 ? formatQtyString(short) : null,
    }
    needs.push(row)
    if (short > 0) {
      shortfalls.push({
        ...row,
        shortfall: formatQtyString(short),
      })
    }
  }

  return { needs, shortfalls }
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} profileId
 * @param {Array<{ stockItemId: string }>} needs
 */
function excludeBulkNeeds(db, profileId, needs) {
  if (!needs.length) return []
  const placeholders = needs.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT id, payload_json FROM stock_items
       WHERE business_profile_id = ? AND id IN (${placeholders})`,
    )
    .all(profileId, ...needs.map((n) => n.stockItemId))

  const skip = new Set()
  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload_json || '{}')
      if (payload.isBulk === true) skip.add(row.id)
    } catch {
      /* ignore */
    }
  }
  return needs.filter((n) => !skip.has(n.stockItemId))
}

/**
 * @param {string} type
 * @returns {'in' | 'out'}
 */
function movementDirection(type) {
  if (
    type === 'adjust_out' ||
    type === 'recipe_deduct' ||
    type === 'allotment_issue' ||
    type === 'kitchen_stock_issue'
  ) {
    return 'out'
  }
  return 'in'
}

/**
 * @param {string} before
 * @param {string} quantity
 * @param {string} type
 * @param {{ allowNegative?: boolean }} [opts]
 */
function computeQuantityAfter(before, quantity, type, opts = {}) {
  const beforeN = parseQty(before) ?? 0
  const qtyN = parseQty(quantity)
  if (qtyN == null || qtyN < 0) {
    return { ok: false, code: 'INVALID_QUANTITY', message: 'Quantity must be ≥ 0' }
  }
  if (qtyN === 0) {
    return {
      ok: false,
      code: 'INVALID_QUANTITY',
      message: 'Quantity must be greater than 0',
    }
  }

  const afterN =
    movementDirection(type) === 'out' ? beforeN - qtyN : beforeN + qtyN

  if (afterN < 0 && opts.allowNegative !== true) {
    return {
      ok: false,
      code: 'INSUFFICIENT_STOCK',
      message: 'Not enough stock for this movement',
      onHand: formatQtyString(beforeN),
      quantityBefore: formatQtyString(beforeN),
      quantityAfter: formatQtyString(afterN),
    }
  }

  return {
    ok: true,
    quantityBefore: formatQtyString(beforeN),
    quantityAfter: formatQtyString(afterN),
  }
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{
 *   businessProfileId: string
 *   stockItemId: string
 *   type: string
 *   quantity: string
 *   reason?: string | null
 *   note?: string | null
 *   createdByUserId?: string | null
 *   allowNegative?: boolean
 * }} input
 */
function applyStockMovementLocal(db, input) {
  const row = db
    .prepare(
      `SELECT id, payload_json FROM stock_items
       WHERE id = ? AND business_profile_id = ?`,
    )
    .get(input.stockItemId, input.businessProfileId)

  if (!row) {
    return { ok: false, code: 'NOT_FOUND', message: 'Stock item not found' }
  }

  /** @type {Record<string, unknown>} */
  let payload
  try {
    payload = JSON.parse(row.payload_json || '{}')
  } catch {
    payload = {}
  }

  if (payload.active === false) {
    return {
      ok: false,
      code: 'STOCK_ITEM_DELETED',
      message: 'Cannot move stock for a deleted item',
    }
  }

  const before = String(payload.quantityOnHand ?? '0')
  const computed = computeQuantityAfter(before, input.quantity, input.type, {
    allowNegative: input.allowNegative === true,
  })
  if (!computed.ok) {
    return computed
  }

  payload.quantityOnHand = computed.quantityAfter
  const unit = payload.unit ?? 'piece'

  db.prepare(
    `UPDATE stock_items SET updated_at = datetime('now'), payload_json = ?
     WHERE id = ?`,
  ).run(JSON.stringify(payload), row.id)

  const movementId = randomUUID()
  const movementPayload = {
    id: movementId,
    businessProfileId: input.businessProfileId,
    stockItemId: row.id,
    type: input.type,
    quantity: formatQtyString(parseQty(input.quantity) ?? 0),
    unit,
    quantityBefore: computed.quantityBefore,
    quantityAfter: computed.quantityAfter,
    reason: input.reason?.trim() || null,
    note: input.note?.trim() || null,
    createdByUserId: input.createdByUserId ?? null,
    createdAt: new Date().toISOString(),
  }

  db.prepare(
    `INSERT INTO stock_movements (id, business_profile_id, stock_item_id, created_at, payload_json)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    movementId,
    input.businessProfileId,
    row.id,
    movementPayload.createdAt,
    JSON.stringify(movementPayload),
  )

  enqueueOutbox(db, {
    eventId: movementId,
    eventType: 'stock_movement.created',
    payload: {
      movementId,
      id: movementId,
      businessProfileId: input.businessProfileId,
      stockItemId: row.id,
    },
  })

  return { ok: true, item: payload, movement: movementPayload }
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{
 *   businessProfileId: string
 *   kitchenOrderId: string
 *   linesSnapshot: unknown
 *   allowNegative?: boolean
 *   orderNumber?: number
 *   createdByUserId?: string | null
 * }} opts
 */
function deductOnKitchenReady(db, opts) {
  const lines = Array.isArray(opts.linesSnapshot) ? opts.linesSnapshot : []
  const menuItemIds = lines
    .map((l) => (l && typeof l === 'object' ? l.menuItemId : null))
    .filter(Boolean)

  const orderRow = db
    .prepare(`SELECT payload_json FROM kitchen_orders WHERE id = ?`)
    .get(opts.kitchenOrderId)

  if (!orderRow) {
    return { ok: false, code: 'NOT_FOUND', message: 'Kitchen order not found' }
  }

  /** @type {Record<string, unknown>} */
  let orderPayload
  try {
    orderPayload = JSON.parse(orderRow.payload_json || '{}')
  } catch {
    orderPayload = {}
  }

  if (orderPayload.stockDeductedAt) {
    return { ok: true, deducted: false, shortfalls: [] }
  }

  if (menuItemIds.length === 0) {
    orderPayload.stockDeductedAt = new Date().toISOString()
    db.prepare(
      `UPDATE kitchen_orders SET updated_at = datetime('now'), payload_json = ? WHERE id = ?`,
    ).run(JSON.stringify(orderPayload), opts.kitchenOrderId)
    return { ok: true, deducted: false, shortfalls: [] }
  }

  const recipesByMenuItemId = loadRecipesMap(
    db,
    opts.businessProfileId,
    menuItemIds,
  )
  const { needs } = aggregateRecipeStockNeeds(lines, recipesByMenuItemId)
  const fromMain = excludeBulkNeeds(db, opts.businessProfileId, needs)

  const reason = opts.orderNumber
    ? `Kitchen order #${opts.orderNumber}`
    : 'Kitchen ready'

  for (const need of fromMain) {
    const result = applyStockMovementLocal(db, {
      businessProfileId: opts.businessProfileId,
      stockItemId: need.stockItemId,
      type: 'recipe_deduct',
      quantity: need.required,
      reason,
      createdByUserId: opts.createdByUserId ?? null,
      allowNegative: opts.allowNegative === true,
    })
    if (!result.ok) {
      return {
        ok: false,
        code: result.code ?? 'INSUFFICIENT_STOCK',
        shortfalls: [
          {
            ...need,
            onHand: result.onHand ?? '0',
            shortfall: need.required,
          },
        ],
      }
    }
  }

  orderPayload.stockDeductedAt = new Date().toISOString()
  db.prepare(
    `UPDATE kitchen_orders SET updated_at = datetime('now'), payload_json = ? WHERE id = ?`,
  ).run(JSON.stringify(orderPayload), opts.kitchenOrderId)

  return { ok: true, deducted: fromMain.length > 0, shortfalls: [] }
}

module.exports = {
  loadRecipesMap,
  aggregateRecipeStockNeeds,
  excludeBulkNeeds,
  applyStockMovementLocal,
  deductOnKitchenReady,
}
