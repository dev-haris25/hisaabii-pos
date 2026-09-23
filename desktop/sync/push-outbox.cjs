const { getLocalDb, getLocalStatus } = require('../db/open-db.cjs')

/**
 * @param {number} [limit]
 */
function listPendingOutbox(limit = 50) {
  const db = getLocalDb()
  return db
    .prepare(
      `SELECT id, event_id, event_type, payload_json, created_at, attempts
       FROM outbox
       WHERE synced_at IS NULL
       ORDER BY id ASC
       LIMIT ?`,
    )
    .all(limit)
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} invoiceId
 */
function loadInvoiceSnapshot(db, invoiceId) {
  const row = db
    .prepare(
      `SELECT id, invoice_number, zatca_status, payload_json
       FROM invoices WHERE id = ?`,
    )
    .get(invoiceId)
  if (!row) return null
  let invoice = {}
  try {
    invoice = JSON.parse(row.payload_json || '{}')
  } catch {
    invoice = {}
  }
  invoice.id = row.id
  invoice.invoiceNumber = row.invoice_number || invoice.invoiceNumber
  invoice.zatcaStatus = row.zatca_status || invoice.zatcaStatus

  const lines = db
    .prepare(`SELECT id, payload_json FROM invoice_lines WHERE invoice_id = ?`)
    .all(invoiceId)
    .map((l) => {
      try {
        const p = JSON.parse(l.payload_json || '{}')
        return { ...p, id: l.id }
      } catch {
        return { id: l.id }
      }
    })

  const tip = db
    .prepare(
      `SELECT invoice_counter, last_invoice_hash FROM zatca_device_tip WHERE business_profile_id = ?`,
    )
    .get(row.business_profile_id || invoice.businessProfileId)

  // business_profile_id is on invoices table
  const invMeta = db
    .prepare(`SELECT business_profile_id FROM invoices WHERE id = ?`)
    .get(invoiceId)

  const tipRow = db
    .prepare(
      `SELECT invoice_counter, last_invoice_hash FROM zatca_device_tip WHERE business_profile_id = ?`,
    )
    .get(invMeta?.business_profile_id)

  return {
    invoice,
    lines,
    tip: tipRow
      ? {
          invoiceCounter: Number(tipRow.invoice_counter) || 0,
          lastInvoiceHash: tipRow.last_invoice_hash || '',
        }
      : tip
        ? {
            invoiceCounter: Number(tip.invoice_counter) || 0,
            lastInvoiceHash: tip.last_invoice_hash || '',
          }
        : null,
  }
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} kitchenOrderId
 */
function loadKitchenSnapshot(db, kitchenOrderId) {
  const row = db
    .prepare(`SELECT id, status, payload_json FROM kitchen_orders WHERE id = ?`)
    .get(kitchenOrderId)
  if (!row) return null
  let payload = {}
  try {
    payload = JSON.parse(row.payload_json || '{}')
  } catch {
    payload = {}
  }
  return {
    ...payload,
    id: row.id,
    status: row.status || payload.status,
  }
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} movementId
 */
function loadMovementSnapshot(db, movementId) {
  const row = db
    .prepare(
      `SELECT id, stock_item_id, payload_json, created_at FROM stock_movements WHERE id = ?`,
    )
    .get(movementId)
  if (!row) return null
  let payload = {}
  try {
    payload = JSON.parse(row.payload_json || '{}')
  } catch {
    payload = {}
  }
  return {
    ...payload,
    id: row.id,
    stockItemId: row.stock_item_id || payload.stockItemId,
    createdAt: row.created_at || payload.createdAt,
  }
}

/**
 * Build hydrated push events from pending outbox rows.
 * @param {number} [limit]
 */
function buildPushEvents(limit = 40) {
  const db = getLocalDb()
  const rows = listPendingOutbox(limit)
  /** @type {Array<Record<string, unknown>>} */
  const events = []

  for (const row of rows) {
    let payload = {}
    try {
      payload = JSON.parse(row.payload_json || '{}')
    } catch {
      payload = {}
    }

    const eventType = row.event_type
    /** @type {Record<string, unknown>} */
    const event = {
      eventId: row.event_id,
      eventType,
      payload,
      _outboxId: row.id,
    }

    if (eventType === 'invoice.created') {
      const invoiceId = String(payload.invoiceId || row.event_id)
      const snap = loadInvoiceSnapshot(db, invoiceId)
      if (!snap) {
        event._skip = 'missing_invoice'
      } else {
        event.invoice = snap.invoice
        event.lines = snap.lines
        event.tip = snap.tip
      }
    } else if (eventType === 'kitchen_order.created') {
      const kitchenOrderId = String(payload.kitchenOrderId || row.event_id)
      const kitchen = loadKitchenSnapshot(db, kitchenOrderId)
      if (!kitchen) {
        event._skip = 'missing_kitchen'
      } else {
        event.kitchenOrder = kitchen
      }
    } else if (eventType === 'kitchen_order.status') {
      // payload already has status fields; ensure updatedAt present
      if (!payload.updatedAt) {
        const kitchen = loadKitchenSnapshot(
          db,
          String(payload.kitchenOrderId || ''),
        )
        if (kitchen?.updatedAt) payload.updatedAt = kitchen.updatedAt
        if (kitchen?.stockDeductedAt) {
          payload.stockDeductedAt = kitchen.stockDeductedAt
        }
        event.payload = payload
      }
    } else if (eventType === 'stock_movement.created') {
      const movementId = String(payload.movementId || payload.id || row.event_id)
      const movement = loadMovementSnapshot(db, movementId)
      if (!movement) {
        event._skip = 'missing_movement'
      } else {
        event.movement = movement
      }
    }

    events.push(event)
  }

  return events
}

/**
 * Mark outbox rows synced after successful push.
 * @param {Array<number|string>} outboxIds
 */
function markOutboxSynced(outboxIds) {
  const db = getLocalDb()
  const stmt = db.prepare(
    `UPDATE outbox SET synced_at = datetime('now'), last_error = NULL WHERE id = ?`,
  )
  const run = db.transaction((ids) => {
    for (const id of ids) stmt.run(id)
  })
  run(outboxIds)
}

/**
 * @param {Array<{ id: number, error: string }>} failures
 */
function markOutboxAttempt(failures) {
  const db = getLocalDb()
  const stmt = db.prepare(
    `UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?`,
  )
  const run = db.transaction((rows) => {
    for (const row of rows) stmt.run(String(row.error).slice(0, 500), row.id)
  })
  run(failures)
}

function pendingOutboxCount() {
  return getLocalStatus().pendingOutboxCount
}

/**
 * @param {string} [pullCursor]
 */
function finalizePush(pullCursor) {
  const db = getLocalDb()
  if (pullCursor) {
    db.prepare(
      `UPDATE sync_state SET last_push_at = datetime('now'), updated_at = datetime('now') WHERE id = 1`,
    ).run()
  } else {
    db.prepare(
      `UPDATE sync_state SET last_push_at = datetime('now'), updated_at = datetime('now') WHERE id = 1`,
    ).run()
  }
}

module.exports = {
  listPendingOutbox,
  buildPushEvents,
  markOutboxSynced,
  markOutboxAttempt,
  pendingOutboxCount,
  finalizePush,
}
