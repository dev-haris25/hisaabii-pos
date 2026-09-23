const { getLocalDb } = require('../db/open-db.cjs')
const { deductOnKitchenReady } = require('../stock/local-stock.cjs')
const { enqueueOutbox } = require('./outbox.cjs')

const ACTIVE_STATUSES = new Set(['pending', 'preparing', 'ready'])

/**
 * @param {string} current
 * @param {string} next
 */
function canTransitionKitchenStatus(current, next) {
  if (!current || !next || current === next) return false
  if (current === 'cancelled' || current === 'completed') return false
  if (ACTIVE_STATUSES.has(current) && ACTIVE_STATUSES.has(next)) return true
  if (current === 'ready' && next === 'completed') return true
  return false
}

/**
 * @param {string} next
 */
function kitchenStatusUpdateFields(next, payload) {
  const nowIso = new Date().toISOString()
  const updated = { ...payload, status: next, updatedAt: nowIso }
  if (next === 'completed') {
    updated.completedAt = nowIso
  } else {
    updated.completedAt = null
  }
  return updated
}

/**
 * @param {{
 *   kitchenOrderId?: string
 *   invoiceId?: string
 *   status: string
 *   userId?: string | null
 *   allowNegative?: boolean
 * }} input
 */
function updateKitchenStatus(input) {
  const db = getLocalDb()
  let row = null
  if (input.kitchenOrderId) {
    row = db
      .prepare(
        `SELECT id, business_profile_id, status, payload_json FROM kitchen_orders WHERE id = ?`,
      )
      .get(input.kitchenOrderId)
  }
  if (!row && input.invoiceId) {
    const invoiceId = String(input.invoiceId)
    const rows = db
      .prepare(
        `SELECT id, business_profile_id, status, payload_json FROM kitchen_orders`,
      )
      .all()
    row =
      rows.find((r) => {
        try {
          const p = JSON.parse(r.payload_json || '{}')
          return String(p.invoiceId || '') === invoiceId
        } catch {
          return false
        }
      }) ?? null
  }

  if (!row) {
    return { ok: false, code: 'NOT_FOUND', message: 'Kitchen order not found' }
  }

  const currentStatus = row.status || 'pending'
  const nextStatus = String(input.status || '').trim()
  if (!canTransitionKitchenStatus(currentStatus, nextStatus)) {
    return {
      ok: false,
      code: 'INVALID_ORDER_STATUS',
      message: 'That status change is not allowed',
    }
  }

  /** @type {Record<string, unknown>} */
  let payload
  try {
    payload = JSON.parse(row.payload_json || '{}')
  } catch {
    payload = {}
  }

  const shouldDeduct =
    nextStatus === 'ready' && !payload.stockDeductedAt

  let allowNegative = input.allowNegative === true
  const settingsRow = db
    .prepare(`SELECT payload_json FROM business_settings WHERE business_profile_id = ?`)
    .get(row.business_profile_id)
  if (settingsRow?.payload_json) {
    try {
      const settings = JSON.parse(settingsRow.payload_json)
      if (settings.allowNegativeStock === true) allowNegative = true
    } catch {
      /* ignore */
    }
  }

  try {
    const apply = db.transaction(() => {
      if (shouldDeduct) {
      const deduct = deductOnKitchenReady(db, {
        businessProfileId: row.business_profile_id,
        kitchenOrderId: row.id,
        linesSnapshot: payload.linesSnapshot,
        createdByUserId: input.userId ?? null,
        allowNegative,
        orderNumber: payload.orderNumber,
      })
      if (!deduct.ok) {
        const err = new Error(deduct.message || 'Insufficient stock')
        err.code = deduct.code || 'INSUFFICIENT_STOCK'
        err.shortfalls = deduct.shortfalls
        throw err
      }
      try {
        payload = JSON.parse(
          db
            .prepare(`SELECT payload_json FROM kitchen_orders WHERE id = ?`)
            .get(row.id).payload_json || '{}',
        )
      } catch {
        /* keep payload */
      }
    }

    const nextPayload = kitchenStatusUpdateFields(nextStatus, payload)
    db.prepare(
      `UPDATE kitchen_orders SET status = ?, updated_at = datetime('now'), payload_json = ? WHERE id = ?`,
    ).run(nextStatus, JSON.stringify(nextPayload), row.id)

    enqueueOutbox(db, {
      eventId: `${row.id}:status:${nextStatus}:${Date.now()}`,
      eventType: 'kitchen_order.status',
      payload: {
        kitchenOrderId: row.id,
        invoiceId: nextPayload.invoiceId ?? null,
        status: nextStatus,
        businessProfileId: row.business_profile_id,
        updatedAt: nextPayload.updatedAt ?? new Date().toISOString(),
        stockDeductedAt: nextPayload.stockDeductedAt ?? null,
        completedAt: nextPayload.completedAt ?? null,
      },
    })

      return {
        ok: true,
        kitchenOrderId: row.id,
        invoiceId: nextPayload.invoiceId ?? null,
        orderNumber: nextPayload.orderNumber ?? null,
        status: nextStatus,
      }
    })

    return apply()
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err ? String(err.code) : 'CHECKOUT_FAILED'
    return {
      ok: false,
      code,
      message: err instanceof Error ? err.message : 'Status update failed',
      shortfalls:
        err && typeof err === 'object' && 'shortfalls' in err ? err.shortfalls : undefined,
    }
  }
}

module.exports = {
  updateKitchenStatus,
  canTransitionKitchenStatus,
  listLocalKitchenBoard,
}

/**
 * Kitchen board columns from local SQLite (offline).
 * @param {{ view?: 'kitchen' | 'display' }} [opts]
 */
function listLocalKitchenBoard(opts = {}) {
  const db = getLocalDb()
  const view = opts.view === 'display' ? 'display' : 'kitchen'
  const rows = db
    .prepare(
      `SELECT id, status, payload_json, updated_at FROM kitchen_orders
       ORDER BY updated_at DESC LIMIT 300`,
    )
    .all()

  /** @type {Record<string, unknown>[]} */
  const pending = []
  /** @type {Record<string, unknown>[]} */
  const preparing = []
  /** @type {Record<string, unknown>[]} */
  const ready = []
  /** @type {Record<string, unknown>[]} */
  const completed = []

  for (const row of rows) {
    /** @type {Record<string, unknown>} */
    let payload
    try {
      payload = JSON.parse(row.payload_json || '{}')
    } catch {
      continue
    }
    const status = String(row.status || payload.status || 'pending')
    const invoiceId = String(payload.invoiceId || '')
    if (!invoiceId) continue

    /** @type {Record<string, unknown>} */
    const mapped = {
      invoiceId,
      kitchenOrderId: row.id,
      orderNumber: payload.orderNumber ?? null,
      status,
      createdAt:
        typeof payload.createdAt === 'string'
          ? payload.createdAt
          : new Date().toISOString(),
    }
    if (view === 'kitchen') {
      mapped.lines = Array.isArray(payload.linesSnapshot)
        ? payload.linesSnapshot
        : []
      mapped.itemsUpdatedAt =
        typeof payload.itemsUpdatedAt === 'string'
          ? payload.itemsUpdatedAt
          : mapped.createdAt
      mapped.updated = false
      mapped.completedAt =
        typeof payload.completedAt === 'string' ? payload.completedAt : null
    }

    if (status === 'pending') pending.push(mapped)
    else if (status === 'preparing') preparing.push(mapped)
    else if (status === 'ready') ready.push(mapped)
    else if (status === 'completed') completed.push(mapped)
  }

  return {
    ok: true,
    pending,
    preparing,
    ready,
    completed: completed.slice(0, 50),
  }
}
