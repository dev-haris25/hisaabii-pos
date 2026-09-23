const { getLocalDb, getLocalStatus } = require('../db/open-db.cjs')

/**
 * @param {string} raw
 */
function parsePayload(raw) {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * @param {Record<string, unknown> | null} payload
 * @param {string} id
 */
function asItem(payload, id) {
  if (!payload || typeof payload !== 'object') return { id }
  return { ...payload, id: payload.id || id }
}

/**
 * @param {{
 *   search?: string
 *   active?: string
 *   categoryId?: string
 *   page?: number
 *   limit?: number
 * }} [opts]
 */
function listLocalMenuItems(opts = {}) {
  const status = getLocalStatus()
  const biz = status.businessProfileId
  if (!biz) {
    return {
      ok: false,
      code: 'OFFLINE_NOT_READY',
      message: 'No restaurant data on this till',
      status: 403,
    }
  }

  const db = getLocalDb()
  const rows = db
    .prepare(
      `SELECT id, category_id, active, payload_json
       FROM menu_items WHERE business_profile_id = ?
       ORDER BY id ASC`,
    )
    .all(biz)

  const search = String(opts.search || '')
    .trim()
    .toLowerCase()
  const activeFilter =
    opts.active === 'true' || opts.active === 'false' ? opts.active : 'all'
  const categoryId = String(opts.categoryId || '').trim()

  let items = rows
    .map((row) => {
      const payload = parsePayload(row.payload_json)
      const item = asItem(payload, row.id)
      if (item.active == null) item.active = row.active === 1
      if (item.categoryId == null && row.category_id) {
        item.categoryId = row.category_id
      }
      return item
    })
    .filter((item) => {
      if (activeFilter === 'true' && item.active !== true) return false
      if (activeFilter === 'false' && item.active !== false) return false
      if (categoryId && String(item.categoryId || '') !== categoryId) return false
      if (!search) return true
      const ar = String(item.nameAr || '').toLowerCase()
      const en = String(item.nameEn || '').toLowerCase()
      return ar.includes(search) || en.includes(search)
    })

  items.sort((a, b) => {
    const so = Number(a.sortOrder || 0) - Number(b.sortOrder || 0)
    if (so !== 0) return so
    return String(a.nameAr || '').localeCompare(String(b.nameAr || ''))
  })

  const page = Math.max(1, Number(opts.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(opts.limit) || 10))
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const start = (page - 1) * limit
  const slice = items.slice(start, start + limit)

  return {
    ok: true,
    items: slice,
    pagination: { page, limit, total, totalPages },
  }
}

function listLocalMenuCategories() {
  const status = getLocalStatus()
  const biz = status.businessProfileId
  if (!biz) {
    return {
      ok: false,
      code: 'OFFLINE_NOT_READY',
      message: 'No restaurant data on this till',
      status: 403,
    }
  }

  const db = getLocalDb()
  const rows = db
    .prepare(
      `SELECT id, sort_order, payload_json
       FROM menu_categories WHERE business_profile_id = ?
       ORDER BY sort_order ASC, id ASC`,
    )
    .all(biz)

  const categories = rows.map((row) => {
    const payload = parsePayload(row.payload_json)
    const cat = asItem(payload, row.id)
    if (cat.sortOrder == null) cat.sortOrder = row.sort_order
    return cat
  })

  return { ok: true, categories }
}

/**
 * @param {{
 *   search?: string
 *   page?: number
 *   limit?: number
 * }} [opts]
 */
function listLocalStockItems(opts = {}) {
  const status = getLocalStatus()
  const biz = status.businessProfileId
  if (!biz) {
    return {
      ok: false,
      code: 'OFFLINE_NOT_READY',
      message: 'No restaurant data on this till',
      status: 403,
    }
  }

  const db = getLocalDb()
  const rows = db
    .prepare(
      `SELECT id, payload_json FROM stock_items WHERE business_profile_id = ?`,
    )
    .all(biz)

  const search = String(opts.search || '')
    .trim()
    .toLowerCase()

  let items = rows
    .map((row) => asItem(parsePayload(row.payload_json), row.id))
    .filter((item) => item.active !== false)
    .filter((item) => {
      if (!search) return true
      const ar = String(item.nameAr || '').toLowerCase()
      const en = String(item.nameEn || '').toLowerCase()
      return ar.includes(search) || en.includes(search)
    })

  items.sort((a, b) =>
    String(a.nameAr || '').localeCompare(String(b.nameAr || '')),
  )

  const page = Math.max(1, Number(opts.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(opts.limit) || 10))
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const start = (page - 1) * limit

  return {
    ok: true,
    items: items.slice(start, start + limit),
    pagination: { page, limit, total, totalPages },
  }
}

module.exports = {
  listLocalMenuItems,
  listLocalMenuCategories,
  listLocalStockItems,
}
