const { randomUUID } = require('node:crypto')
const { getLocalDb, getLocalStatus } = require('../db/open-db.cjs')
const { loadZatcaSecrets } = require('../sync/zatca-secrets-store.cjs')
const { assertLocalOfflineCheckoutAllowed } = require('../local-api/till-primary.cjs')
const { signOfflineInvoice } = require('../zatca/sign-offline.cjs')
const {
  parseMoney,
  decimalStringFromNumber,
  allocateOrderDiscount,
  computeInvoiceTotals,
  isValidDiscountPercent,
  isDiscountWithinCap,
  orderDiscountMoneyFromPercent,
} = require('./money.cjs')
const { resolveCheckoutModifiers } = require('./resolve-modifiers.cjs')
const {
  loadRecipesMap,
  aggregateRecipeStockNeeds,
  excludeBulkNeeds,
} = require('../stock/local-stock.cjs')
const { enqueueOutbox } = require('./outbox.cjs')

/**
 * @param {number | string} n
 * @param {string} [prefix]
 * @param {number} [padding]
 */
function formatInvoiceNumber(n, prefix = 'INV-', padding = 4) {
  const num = Number.parseInt(String(n), 10)
  const pad = Math.max(1, Math.min(10, Number(padding) || 4))
  if (!Number.isFinite(num) || num < 1) {
    return `${prefix}${String(1).padStart(pad, '0')}`
  }
  return `${prefix}${String(num).padStart(pad, '0')}`
}

function riyadhOrderDateString(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/**
 * @param {unknown} snapshot
 */
function kitchenLinesSnapshot(lines) {
  if (!Array.isArray(lines)) return []
  return lines
    .filter((l) => Number(l?.quantity) > 0)
    .map((l) => ({
      menuItemId: l.menuItemId != null ? String(l.menuItemId) : null,
      nameAr: String(l.nameAr ?? '').trim(),
      nameEn: l.nameEn != null ? String(l.nameEn).trim() : null,
      quantity: Number.parseInt(String(l.quantity), 10) || 0,
      lineNote: l.lineNote != null ? String(l.lineNote).trim() || null : null,
      modifiersSnapshot: l.modifiersSnapshot ?? { variantOptions: [], customizations: [] },
    }))
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} profileId
 * @param {string} menuItemId
 */
function hydrateMenuItem(db, profileId, menuItemId) {
  const row = db
    .prepare(
      `SELECT id, active, payload_json FROM menu_items
       WHERE id = ? AND business_profile_id = ? AND active = 1`,
    )
    .get(menuItemId, profileId)
  if (!row) return null

  /** @type {Record<string, unknown>} */
  let item
  try {
    item = JSON.parse(row.payload_json || '{}')
  } catch {
    item = {}
  }
  item.id = row.id
  item.active = row.active !== 0

  if (!Array.isArray(item.variantGroups) || item.variantGroups.length === 0) {
    const groups = db
      .prepare(`SELECT payload_json FROM menu_item_variants WHERE menu_item_id = ?`)
      .all(menuItemId)
    item.variantGroups = groups
      .map((g) => {
        try {
          return JSON.parse(g.payload_json || '{}')
        } catch {
          return null
        }
      })
      .filter(Boolean)
      .sort(
        (a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0),
      )
  }

  if (!Array.isArray(item.customizations) || item.customizations.length === 0) {
    const customs = db
      .prepare(
        `SELECT payload_json FROM menu_item_customizations WHERE menu_item_id = ?`,
      )
      .all(menuItemId)
    item.customizations = customs
      .map((c) => {
        try {
          return JSON.parse(c.payload_json || '{}')
        } catch {
          return null
        }
      })
      .filter(Boolean)
      .sort(
        (a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0),
      )
  }

  return item
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} profileId
 */
function allocateInvoiceNumber(db, profileId) {
  const settingsRow = db
    .prepare(`SELECT payload_json FROM business_settings WHERE business_profile_id = ?`)
    .get(profileId)
  let prefix = 'INV-'
  let padding = 4
  if (settingsRow?.payload_json) {
    try {
      const s = JSON.parse(settingsRow.payload_json)
      if (s.invoicePrefix) prefix = String(s.invoicePrefix)
      if (s.numberPadding != null) padding = Number(s.numberPadding)
    } catch {
      /* defaults */
    }
  }

  db.prepare(
    `INSERT INTO invoice_counters (business_profile_id, last_number) VALUES (?, 1)
     ON CONFLICT(business_profile_id) DO UPDATE SET last_number = last_number + 1`,
  ).run(profileId)
  const counter = db
    .prepare(
      `SELECT last_number FROM invoice_counters WHERE business_profile_id = ?`,
    )
    .get(profileId)
  return formatInvoiceNumber(counter.last_number, prefix, padding)
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} profileId
 * @param {string} orderDate
 */
function allocateKitchenOrderNumber(db, profileId, orderDate) {
  db.prepare(
    `INSERT INTO kitchen_order_counters (business_profile_id, order_date, last_number)
     VALUES (?, ?, 1)
     ON CONFLICT(business_profile_id, order_date) DO UPDATE SET last_number = last_number + 1`,
  ).run(profileId, orderDate)
  const counter = db
    .prepare(
      `SELECT last_number FROM kitchen_order_counters
       WHERE business_profile_id = ? AND order_date = ?`,
    )
    .get(profileId, orderDate)
  return Number(counter?.last_number) || 1
}

/**
 * @param {{ body: unknown, staffUser: { id: string, name?: string | null } }} input
 */
async function localCheckout(input) {
  const body = input.body && typeof input.body === 'object' ? input.body : {}
  const staffUser = input.staffUser

  const gate = assertLocalOfflineCheckoutAllowed({ tillId: body.tillId })
  if (!gate.ok) {
    return { ok: false, code: gate.code, message: gate.message }
  }

  const status = getLocalStatus()
  const profileId = status.businessProfileId
  if (!profileId) {
    return {
      ok: false,
      code: 'OFFLINE_NOT_READY',
      message: 'Local restaurant data is not ready',
    }
  }

  const linesIn = Array.isArray(body.lines) ? body.lines : []
  if (linesIn.length === 0 || linesIn.length > 100) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'Invalid cart lines' }
  }

  const paymentMethod = body.paymentMethod === 'card' ? 'card' : body.paymentMethod === 'cash' ? 'cash' : null
  if (!paymentMethod) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'Invalid payment method' }
  }

  const db = getLocalDb()

  const profileRow = db
    .prepare(`SELECT payload_json FROM business_profiles WHERE id = ?`)
    .get(profileId)
  if (!profileRow) {
    return {
      ok: false,
      code: 'BUSINESS_PROFILE_REQUIRED',
      message: 'Restaurant profile not found locally',
    }
  }

  /** @type {Record<string, unknown>} */
  let profile
  try {
    profile = JSON.parse(profileRow.payload_json || '{}')
  } catch {
    profile = {}
  }

  if (!profile.onboardingCompletedAt) {
    return {
      ok: false,
      code: 'BUSINESS_PROFILE_REQUIRED',
      message: 'Complete restaurant profile first',
    }
  }

  const secretsBundle = loadZatcaSecrets()
  const secrets =
    secretsBundle?.businessProfileId === profileId ? secretsBundle.secrets : null
  if (!secrets || !secrets.productionCsid) {
    return {
      ok: false,
      code: 'ZATCA_NOT_ONBOARDED',
      message: 'Complete ZATCA onboarding first',
    }
  }

  const tipRow = db
    .prepare(
      `SELECT invoice_counter, last_invoice_hash, environment, payload_json
       FROM zatca_device_tip WHERE business_profile_id = ?`,
    )
    .get(profileId)

  const tip = {
    invoiceCounter: Number(tipRow?.invoice_counter) || 0,
    lastInvoiceHash: tipRow?.last_invoice_hash || '',
    environment: tipRow?.environment ?? profile.zatcaEnvironment ?? null,
  }

  let tipPayload = null
  if (tipRow?.payload_json) {
    try {
      tipPayload = JSON.parse(tipRow.payload_json)
    } catch {
      tipPayload = null
    }
  }

  if (!secrets.complianceCsid && tipPayload?.complianceCsid) {
    secrets.complianceCsid = tipPayload.complianceCsid
  }

  const itemIds = [...new Set(linesIn.map((l) => String(l.menuItemId || '').trim()).filter(Boolean))]
  /** @type {Map<string, Record<string, unknown>>} */
  const byId = new Map()
  for (const id of itemIds) {
    const item = hydrateMenuItem(db, profileId, id)
    if (!item) {
      return {
        ok: false,
        code: 'INVALID_MENU_ITEM',
        message: 'One or more menu items are invalid',
      }
    }
    byId.set(id, item)
  }

  /** @type {Array<{ quantity: number, unitPrice: string, vatPreset: string, modifiersSnapshot: unknown, lineNote: string | null, menuItemId: string, nameAr: string, nameEn: string | null }>} */
  const pricedLines = []
  try {
    for (const l of linesIn) {
      const menuItemId = String(l.menuItemId || '').trim()
      const item = byId.get(menuItemId)
      const qty = Number.parseInt(String(l.quantity), 10)
      if (!item || !Number.isFinite(qty) || qty < 1) {
        return {
          ok: false,
          code: 'VALIDATION_ERROR',
          message: 'Invalid line quantity',
        }
      }
      const resolved = resolveCheckoutModifiers(
        item,
        l.variantOptionIds,
        l.customizationIds,
      )
      pricedLines.push({
        menuItemId,
        quantity: qty,
        unitPrice: resolved.unitPrice,
        vatPreset: String(item.vatPreset ?? 'standard'),
        modifiersSnapshot: resolved.modifiersSnapshot,
        lineNote: l.lineNote?.trim?.() || null,
        nameAr: String(item.nameAr ?? ''),
        nameEn: item.nameEn != null ? String(item.nameEn) : null,
      })
    }
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err ? String(err.code) : 'VALIDATION_ERROR'
    return {
      ok: false,
      code,
      message: err instanceof Error ? err.message : 'Invalid item options',
    }
  }

  let bizSettings = {}
  const settingsRow = db
    .prepare(`SELECT payload_json FROM business_settings WHERE business_profile_id = ?`)
    .get(profileId)
  if (settingsRow?.payload_json) {
    try {
      bizSettings = JSON.parse(settingsRow.payload_json)
    } catch {
      bizSettings = {}
    }
  }

  const recipesByMenuItemId = loadRecipesMap(db, profileId, itemIds)
  const { needs } = aggregateRecipeStockNeeds(
    pricedLines.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity })),
    recipesByMenuItemId,
  )
  const fromMain = excludeBulkNeeds(db, profileId, needs)
  const stockShortfalls = fromMain.filter((n) => n.shortfall)

  if (stockShortfalls.length > 0) {
    if (bizSettings.allowNegativeStock === true) {
      /* continue */
    } else if (body.allowNegativeStock === true) {
      bizSettings.allowNegativeStock = true
      db.prepare(
        `INSERT INTO business_settings (business_profile_id, updated_at, payload_json)
         VALUES (?, datetime('now'), ?)
         ON CONFLICT(business_profile_id) DO UPDATE SET
           updated_at = excluded.updated_at,
           payload_json = excluded.payload_json`,
      ).run(profileId, JSON.stringify(bizSettings))
    } else {
      return {
        ok: false,
        code: 'INSUFFICIENT_STOCK_CONFIRM',
        message: 'Not enough stock — allow negative stock to continue',
        shortfalls: stockShortfalls,
      }
    }
  }

  const baseLines = pricedLines.map((l) => ({
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    vatPreset: l.vatPreset,
  }))

  const discountPercent = body.discount ?? '0'
  if (
    String(discountPercent).trim() &&
    (!isValidDiscountPercent(discountPercent) ||
      !isDiscountWithinCap(discountPercent, bizSettings.discountCap))
  ) {
    return {
      ok: false,
      code: 'DISCOUNT_EXCEEDS_CAP',
      message: 'Discount is above the restaurant cap',
    }
  }

  const discountMoney = orderDiscountMoneyFromPercent(baseLines, discountPercent)
  const lineDiscounts = allocateOrderDiscount(baseLines, discountMoney)
  const computeInput = baseLines.map((l, i) => ({
    ...l,
    discount: lineDiscounts[i],
  }))
  const totals = computeInvoiceTotals(computeInput)

  if (paymentMethod === 'cash') {
    const tendered = parseMoney(body.amountTendered)
    const grand = parseMoney(totals.grandTotal)
    if (!body.amountTendered || tendered < grand) {
      return {
        ok: false,
        code: 'INSUFFICIENT_TENDER',
        message: 'Amount tendered is less than the total',
      }
    }
  }

  const changeGiven =
    paymentMethod === 'cash'
      ? decimalStringFromNumber(
          parseMoney(body.amountTendered) - parseMoney(totals.grandTotal),
        )
      : null

  const invoiceDate = new Date()
  const invoiceId = randomUUID()
  const kitchenOrderId = randomUUID()
  const orderDate = riyadhOrderDateString(invoiceDate)

  let invoiceNumber
  let orderNumber
  let signed
  let persisted

  try {
    const txResult = db.transaction(() => {
      invoiceNumber = allocateInvoiceNumber(db, profileId)
      orderNumber = allocateKitchenOrderNumber(db, profileId, orderDate)

      const invoiceForSign = {
        id: invoiceId,
        invoiceNumber,
        invoiceDate,
        sellerCompanyNameAr: String(profile.companyNameAr ?? ''),
        sellerCompanyNameEn: profile.companyNameEn ?? null,
        sellerVatNumber: String(profile.vatNumber ?? ''),
        sellerCrNumber: String(profile.crNumber ?? ''),
        sellerAddressAr: String(profile.addressAr ?? ''),
        sellerAddressEn: profile.addressEn ?? null,
        sellerStreetAr: String(profile.streetAr ?? ''),
        sellerStreetEn: String(profile.streetEn ?? ''),
        sellerDistrictAr: String(profile.districtAr ?? ''),
        sellerDistrictEn: profile.districtEn ?? null,
        sellerCityAr: String(profile.cityAr ?? ''),
        sellerCityEn: profile.cityEn ?? null,
        sellerBuildingNumber: String(profile.buildingNumber ?? ''),
        sellerSecondaryNumber: String(profile.secondaryNumber ?? ''),
        sellerPostalCode: String(profile.postalCode ?? ''),
        sellerShortAddress: String(profile.shortAddress ?? ''),
        sellerCountryCode: String(profile.countryCode ?? 'SA'),
        sellerEmail: profile.email?.trim?.() || null,
        sellerPhone: profile.phone?.trim?.() || null,
        paymentMethod,
        amountTendered: paymentMethod === 'cash' ? body.amountTendered : null,
        changeGiven,
        subtotal: totals.subtotal,
        totalVat: totals.totalVat,
        grandTotal: totals.grandTotal,
        notes: body.notes?.trim?.() || null,
        status: 'completed',
        type: 'simplified',
        createdByStaffId: staffUser.id,
      }

      const zatcaLines = pricedLines.map((l, idx) => ({
        nameAr: l.nameAr,
        nameEn: l.nameEn,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: totals.perLine[idx].discountStr,
        vatPreset: l.vatPreset,
        sortOrder: idx,
      }))

      signed = signOfflineInvoice({
        invoice: invoiceForSign,
        lines: zatcaLines,
        secrets,
        tip,
        deviceMeta: tipPayload,
      })

      const nowIso = new Date().toISOString()
      const invoicePayload = {
        ...invoiceForSign,
        qrCode: signed.qrCodeBase64,
        xmlPayload: signed.signedXml,
        cryptographicStamp: signed.invoiceHash,
        pih: signed.pih,
        zatcaStatus: 'pending',
        zatcaUuid: signed.zatcaUuid,
        localOnly: true,
        invoiceDate: invoiceDate.toISOString(),
        createdAt: nowIso,
        updatedAt: nowIso,
      }

      db.prepare(
        `INSERT INTO invoices (
           id, business_profile_id, invoice_number, zatca_status, local_only, updated_at, payload_json
         ) VALUES (?, ?, ?, ?, 1, datetime('now'), ?)`,
      ).run(
        invoiceId,
        profileId,
        invoiceNumber,
        'pending',
        JSON.stringify(invoicePayload),
      )

      for (let idx = 0; idx < pricedLines.length; idx++) {
        const l = pricedLines[idx]
        const a = totals.perLine[idx]
        const lineId = randomUUID()
        const linePayload = {
          id: lineId,
          invoiceId,
          menuItemId: l.menuItemId,
          nameAr: l.nameAr,
          nameEn: l.nameEn,
          quantity: a.quantity,
          unitPrice: l.unitPrice,
          discount: a.discountStr,
          vatPreset: l.vatPreset,
          vatAmount: a.vatAmountStr,
          lineTotal: a.lineTotalStr,
          sortOrder: idx,
          lineNote: l.lineNote,
          modifiersSnapshot: l.modifiersSnapshot,
        }
        db.prepare(
          `INSERT INTO invoice_lines (id, invoice_id, payload_json) VALUES (?, ?, ?)`,
        ).run(lineId, invoiceId, JSON.stringify(linePayload))
      }

      const kitchenLines = kitchenLinesSnapshot(
        pricedLines.map((l) => ({
          menuItemId: l.menuItemId,
          nameAr: l.nameAr,
          nameEn: l.nameEn,
          quantity: l.quantity,
          lineNote: l.lineNote,
          modifiersSnapshot: l.modifiersSnapshot,
        })),
      )

      const kitchenPayload = {
        id: kitchenOrderId,
        businessProfileId: profileId,
        invoiceId,
        orderNumber,
        orderDate,
        status: 'pending',
        linesSnapshot: kitchenLines,
        itemsUpdatedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      }

      db.prepare(
        `INSERT INTO kitchen_orders (id, business_profile_id, status, updated_at, payload_json)
         VALUES (?, ?, 'pending', datetime('now'), ?)`,
      ).run(kitchenOrderId, profileId, JSON.stringify(kitchenPayload))

      db.prepare(
        `UPDATE zatca_device_tip SET
           invoice_counter = ?,
           last_invoice_hash = ?,
           updated_at = datetime('now')
         WHERE business_profile_id = ?`,
      ).run(signed.nextCounter, signed.invoiceHash, profileId)

      enqueueOutbox(db, {
        eventId: invoiceId,
        eventType: 'invoice.created',
        payload: { invoiceId, businessProfileId: profileId, localOnly: true },
      })
      enqueueOutbox(db, {
        eventId: kitchenOrderId,
        eventType: 'kitchen_order.created',
        payload: {
          kitchenOrderId,
          invoiceId,
          businessProfileId: profileId,
        },
      })

      persisted = { invoicePayload, kitchenPayload }
      return true
    })()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      code: 'ZATCA_SIGN_ERROR',
      message: msg.slice(0, 500),
    }
  }

  if (!txResult || !persisted) {
    return { ok: false, code: 'CHECKOUT_FAILED', message: 'Checkout failed' }
  }

  const invoiceLines = db
    .prepare(`SELECT payload_json FROM invoice_lines WHERE invoice_id = ?`)
    .all(invoiceId)
    .map((r) => {
      try {
        return JSON.parse(r.payload_json)
      } catch {
        return null
      }
    })
    .filter(Boolean)
    .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder))

  return {
    ok: true,
    invoice: {
      id: invoiceId,
      invoiceNumber,
      grandTotal: totals.grandTotal,
      totalVat: totals.totalVat,
      subtotal: totals.subtotal,
      paymentMethod,
      amountTendered: paymentMethod === 'cash' ? body.amountTendered : null,
      changeGiven,
      qrCode: signed.qrCodeBase64,
      zatcaStatus: 'pending',
      orderNumber,
      invoiceDate: invoiceDate.toISOString(),
      sellerCompanyNameAr: String(profile.companyNameAr ?? ''),
      sellerCompanyNameEn: profile.companyNameEn ?? null,
      sellerVatNumber: String(profile.vatNumber ?? ''),
      sellerCrNumber: String(profile.crNumber ?? ''),
      sellerEmail: profile.email?.trim?.() || null,
      sellerPhone: profile.phone?.trim?.() || null,
      staffName: staffUser.name ?? null,
      lines: invoiceLines.map((l) => ({
        id: l.id,
        nameAr: l.nameAr,
        nameEn: l.nameEn,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount,
        lineTotal: l.lineTotal,
        vatAmount: l.vatAmount,
        modifiersSnapshot: l.modifiersSnapshot ?? null,
      })),
    },
  }
}

/**
 * @param {string} invoiceId
 */
function getLocalInvoiceForPrint(invoiceId) {
  const db = getLocalDb()
  const row = db
    .prepare(`SELECT payload_json FROM invoices WHERE id = ?`)
    .get(invoiceId)
  if (!row) return { ok: false, code: 'NOT_FOUND', message: 'Invoice not found' }

  /** @type {Record<string, unknown>} */
  let invoice
  try {
    invoice = JSON.parse(row.payload_json || '{}')
  } catch {
    return { ok: false, code: 'NOT_FOUND', message: 'Invoice not found' }
  }

  const lines = db
    .prepare(`SELECT payload_json FROM invoice_lines WHERE invoice_id = ?`)
    .all(invoiceId)
    .map((r) => {
      try {
        return JSON.parse(r.payload_json)
      } catch {
        return null
      }
    })
    .filter(Boolean)
    .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder))

  const kitchen = db
    .prepare(
      `SELECT payload_json FROM kitchen_orders WHERE json_extract(payload_json, '$.invoiceId') = ?`,
    )
    .get(invoiceId)
  let orderNumber = null
  if (kitchen?.payload_json) {
    try {
      orderNumber = JSON.parse(kitchen.payload_json).orderNumber ?? null
    } catch {
      orderNumber = null
    }
  }

  return {
    ok: true,
    invoice: {
      id: invoice.id ?? invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      grandTotal: invoice.grandTotal,
      totalVat: invoice.totalVat,
      subtotal: invoice.subtotal,
      paymentMethod: invoice.paymentMethod,
      amountTendered: invoice.amountTendered ?? null,
      changeGiven: invoice.changeGiven ?? null,
      qrCode: invoice.qrCode ?? null,
      zatcaStatus: invoice.zatcaStatus ?? null,
      orderNumber,
      invoiceDate: invoice.invoiceDate,
      sellerCompanyNameAr: invoice.sellerCompanyNameAr,
      sellerCompanyNameEn: invoice.sellerCompanyNameEn ?? null,
      sellerVatNumber: invoice.sellerVatNumber,
      sellerCrNumber: invoice.sellerCrNumber,
      sellerEmail: invoice.sellerEmail ?? null,
      sellerPhone: invoice.sellerPhone ?? null,
      lines: lines.map((l) => ({
        id: l.id,
        nameAr: l.nameAr,
        nameEn: l.nameEn,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount,
        lineTotal: l.lineTotal,
        vatAmount: l.vatAmount,
        modifiersSnapshot: l.modifiersSnapshot ?? null,
      })),
    },
  }
}

module.exports = { localCheckout, getLocalInvoiceForPrint, formatInvoiceNumber }
