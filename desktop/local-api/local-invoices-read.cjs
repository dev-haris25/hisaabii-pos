const { getLocalDb, getLocalStatus } = require('../db/open-db.cjs')

/**
 * @param {string | null | undefined} raw
 */
function parsePayload(raw) {
  try {
    return JSON.parse(raw || '{}')
  } catch {
    return null
  }
}

/**
 * Kitchen order number for an invoice — kitchen_orders is synced locally
 * independent of invoices, so this is a local join, not a stored column.
 * @param {import('better-sqlite3').Database} db
 * @param {string} invoiceId
 */
function resolveOrderNumber(db, invoiceId) {
  const kitchen = db
    .prepare(
      `SELECT payload_json FROM kitchen_orders WHERE json_extract(payload_json, '$.invoiceId') = ?`,
    )
    .get(invoiceId)
  if (!kitchen?.payload_json) return null
  const payload = parsePayload(kitchen.payload_json)
  return payload?.orderNumber ?? null
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string | null | undefined} staffId
 */
function resolveStaffName(db, staffId) {
  if (!staffId) return null
  const row = db
    .prepare(`SELECT name, payload_json FROM users WHERE id = ?`)
    .get(staffId)
  if (!row) return null
  if (row.name) return row.name
  const payload = parsePayload(row.payload_json)
  return payload?.name ?? null
}

/**
 * Read-only invoice list for the offline shell. Invoices sync business-wide
 * (not per-till), so this works the same regardless of which till this is.
 *
 * @param {{ search?: string, page?: number, limit?: number }} [opts]
 */
function listLocalInvoices(opts = {}) {
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
      `SELECT id, invoice_number, payload_json FROM invoices WHERE business_profile_id = ?`,
    )
    .all(biz)

  const search = String(opts.search || '')
    .trim()
    .toLowerCase()

  let invoices = rows.map((row) => {
    const payload = parsePayload(row.payload_json) || {}
    return {
      id: row.id,
      invoiceNumber: payload.invoiceNumber || row.invoice_number || '',
      status: payload.status ?? null,
      invoiceDate: payload.invoiceDate ?? null,
      paymentMethod: payload.paymentMethod ?? null,
      grandTotal: String(payload.grandTotal ?? '0.00'),
      totalVat: String(payload.totalVat ?? '0.00'),
      zatcaStatus: payload.zatcaStatus ?? null,
      hasQr: Boolean(String(payload.qrCode || '').trim()),
      staffName: resolveStaffName(db, payload.createdByStaffId),
      orderNumber: resolveOrderNumber(db, row.id),
    }
  })

  if (search) {
    invoices = invoices.filter((inv) =>
      String(inv.invoiceNumber || '').toLowerCase().includes(search),
    )
  }

  invoices.sort(
    (a, b) =>
      new Date(b.invoiceDate || 0).getTime() -
      new Date(a.invoiceDate || 0).getTime(),
  )

  const page = Math.max(1, Number(opts.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(opts.limit) || 10))
  const total = invoices.length
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const start = (page - 1) * limit

  return {
    ok: true,
    invoices: invoices.slice(start, start + limit),
    pagination: { page, limit, total, totalPages },
  }
}

/**
 * Read-only invoice detail (incl. lines) for the offline shell.
 * Credit/debit notes aren't synced locally, so `linkedNotes` is always [].
 *
 * @param {string} id
 */
function getLocalInvoiceDetail(id) {
  const invoiceId = String(id || '').trim()
  if (!invoiceId) {
    return { ok: false, code: 'NOT_FOUND', message: 'Invoice not found', status: 404 }
  }

  const db = getLocalDb()
  const row = db
    .prepare(`SELECT payload_json FROM invoices WHERE id = ?`)
    .get(invoiceId)
  const payload = row ? parsePayload(row.payload_json) : null
  if (!payload) {
    return { ok: false, code: 'NOT_FOUND', message: 'Invoice not found', status: 404 }
  }

  const lines = db
    .prepare(`SELECT payload_json FROM invoice_lines WHERE invoice_id = ?`)
    .all(invoiceId)
    .map((r) => parsePayload(r.payload_json))
    .filter(Boolean)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
    .map((l) => ({
      id: l.id,
      nameAr: l.nameAr,
      nameEn: l.nameEn ?? null,
      quantity: l.quantity,
      unitPrice: String(l.unitPrice ?? '0.00'),
      discount: String(l.discount ?? '0.00'),
      vatAmount: String(l.vatAmount ?? '0.00'),
      lineTotal: String(l.lineTotal ?? '0.00'),
    }))

  return {
    ok: true,
    invoice: {
      id: payload.id ?? invoiceId,
      invoiceNumber: payload.invoiceNumber,
      status: payload.status ?? null,
      invoiceDate: payload.invoiceDate,
      paymentMethod: payload.paymentMethod,
      amountTendered: payload.amountTendered ?? null,
      changeGiven: payload.changeGiven ?? null,
      subtotal: String(payload.subtotal ?? '0.00'),
      totalVat: String(payload.totalVat ?? '0.00'),
      grandTotal: String(payload.grandTotal ?? '0.00'),
      notes: payload.notes ?? null,
      sellerCompanyNameAr: payload.sellerCompanyNameAr,
      sellerCompanyNameEn: payload.sellerCompanyNameEn ?? null,
      sellerVatNumber: payload.sellerVatNumber,
      sellerCrNumber: payload.sellerCrNumber,
      sellerEmail: payload.sellerEmail ?? null,
      sellerPhone: payload.sellerPhone ?? null,
      qrCode: payload.qrCode ?? null,
      zatcaStatus: payload.zatcaStatus ?? null,
      zatcaLastError: payload.zatcaLastError ?? null,
      staffName: resolveStaffName(db, payload.createdByStaffId),
      orderNumber: resolveOrderNumber(db, invoiceId),
      lines,
      linkedNotes: [],
    },
  }
}

module.exports = { listLocalInvoices, getLocalInvoiceDetail }
