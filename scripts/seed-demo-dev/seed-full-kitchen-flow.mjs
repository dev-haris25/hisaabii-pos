/**
 * Invoice → kitchen ticket → ready deduct from main (skip bulk) → day-end reports.
 * Used by seed-mvp2-demo.mjs (no @/ imports).
 */
import {
  canConvertUnits,
  convertStockQty,
  formatQtyString,
  parseQty,
} from '../../src/lib/stock/units.js'

const SEED_NOTE = 'SEED_KITCHEN_STOCK_V1'
const SALES_DAYS = 7
const DAY_END_REPORTS = 6
const FRYER_L = { fries: 0.03, broast: 0.04, karahi: 0.04 }

export function logFlow(msg) {
  console.info(`[seed-mvp2-demo] ${msg}`)
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1))
}

/** @template T @param {T[]} arr */
function pick(arr) {
  return arr[randInt(0, arr.length - 1)]
}

function riyadhWeekday(isoDate) {
  return new Date(`${isoDate}T12:00:00+03:00`).getDay()
}

/** Small dine-in / takeaway shop: quieter weekdays, busy Thu–Sat. */
function ticketsForRiyadhDay(weekday, isToday) {
  if (isToday) return randInt(32, 44)
  if (weekday === 5) return randInt(62, 86)
  if (weekday === 6) return randInt(68, 92)
  if (weekday === 4) return randInt(54, 76)
  return randInt(42, 58)
}

function pickServiceClock() {
  const r = Math.random()
  let hour
  if (r < 0.08) hour = randInt(10, 11)
  else if (r < 0.43) hour = randInt(12, 15)
  else if (r < 0.56) hour = randInt(16, 17)
  else if (r < 0.94) hour = randInt(18, 22)
  else hour = 23
  return {
    hh: String(hour).padStart(2, '0'),
    mm: String(randInt(0, 59)).padStart(2, '0'),
    ss: String(randInt(0, 59)).padStart(2, '0'),
  }
}

/**
 * @template {{ w: number }} T
 * @param {T[]} pairs
 */
function weightedPick(pairs) {
  const total = pairs.reduce((s, p) => s + p.w, 0)
  let r = Math.random() * total
  for (const p of pairs) {
    r -= p.w
    if (r <= 0) return p
  }
  return pairs[pairs.length - 1]
}

/**
 * Main + optional fries/drink/ranch — typical counter ticket.
 * @param {Map<string, any>} menuByEn
 * @param {any[]} menuItems
 */
function buildTicketRows(menuByEn, menuItems) {
  const mainName = weightedPick([
    { name: 'Chicken Broast', w: 34 },
    { name: 'Chicken Shawarma', w: 28 },
    { name: 'Beef Burger', w: 18 },
    { name: 'Chicken Karahi', w: 12 },
  ]).name
  const main = menuByEn.get(mainName) ?? pick(menuItems)
  const fries = menuByEn.get('French Fries')
  const drinkName = weightedPick([
    { name: 'Soft Drink', w: 55 },
    { name: 'Water', w: 35 },
    { name: 'Fresh Juice', w: 10 },
  ]).name
  const drink = menuByEn.get(drinkName)
  const ranch = menuByEn.get('Ranch Sauce')
  const mainQty = Math.random() < 0.14 ? 2 : 1

  /** @type {Array<{ item: any, qty: number }>} */
  const rows = [{ item: main, qty: mainQty }]
  const pattern = Math.random()
  if (pattern < 0.22) {
    // main only
  } else if (pattern < 0.5 && fries) {
    rows.push({ item: fries, qty: mainQty === 2 ? 2 : 1 })
  } else if (pattern < 0.78 && drink) {
    rows.push({ item: drink, qty: 1 })
  } else {
    if (fries) rows.push({ item: fries, qty: 1 })
    if (drink) rows.push({ item: drink, qty: 1 })
  }
  if (ranch && Math.random() < 0.14) {
    rows.push({ item: ranch, qty: 1 })
  }

  const seen = new Set()
  return rows.filter((row) => {
    if (!row.item || seen.has(row.item.id)) return false
    seen.add(row.item.id)
    return true
  })
}

function riyadhOrderDate(now) {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  return new Date(`${s}T00:00:00.000Z`)
}

function reportDateKey(reportDate) {
  return reportDate.toISOString().slice(0, 10)
}

function riyadhDayBounds(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null
  const from = new Date(`${isoDate}T00:00:00+03:00`)
  const to = new Date(`${isoDate}T23:59:59.999+03:00`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null
  return { from, to }
}

function computeLineWaste(recipeUsed, userUsed, isBulk) {
  if (isBulk) return { quantityWaste: '0', wasteSeverity: null }
  const recipeN = parseQty(recipeUsed ?? '0') ?? 0
  const userN = parseQty(userUsed ?? '')
  if (userN == null) return { quantityWaste: '0', wasteSeverity: null }
  const waste = Math.max(0, userN - recipeN)
  return {
    quantityWaste: formatQtyString(waste),
    wasteSeverity: null,
  }
}

function qtyInStockUnit(perServing, servings, fromUnit, toUnit) {
  const n = (parseQty(perServing) ?? 0) * servings
  if (n <= 0) return 0
  if (fromUnit === toUnit) return n
  if (!canConvertUnits(fromUnit, toUnit)) return 0
  return parseQty(convertStockQty(formatQtyString(n), fromUnit, toUnit)) ?? 0
}

async function loadRecipesByMenuItemIds(prisma, businessProfileId, menuItemIds) {
  const ids = [...new Set(menuItemIds.filter(Boolean))]
  /** @type {Map<string, { ingredients: any[] }>} */
  const map = new Map()
  if (ids.length === 0) return map
  const recipes = await prisma.menuItemRecipe.findMany({
    where: { menuItemId: { in: ids }, menuItem: { businessProfileId } },
    include: {
      ingredients: {
        include: {
          stockItem: {
            select: {
              id: true,
              nameAr: true,
              nameEn: true,
              unit: true,
              quantityOnHand: true,
              active: true,
              isBulk: true,
            },
          },
        },
      },
    },
  })
  for (const rec of recipes) {
    map.set(rec.menuItemId, { ingredients: rec.ingredients })
  }
  return map
}

/**
 * Same as production: deduct non-bulk recipe qty from main only.
 */
async function deductKitchenReady(prisma, opts) {
  const {
    businessProfileId,
    userId,
    kitchenOrderId,
    orderNumber,
    linesSnapshot,
    at,
  } = opts

  const menuItemIds = linesSnapshot
    .map((l) => l.menuItemId)
    .filter((id) => typeof id === 'string')
  const recipesByMenuItemId = await loadRecipesByMenuItemIds(
    prisma,
    businessProfileId,
    menuItemIds,
  )

  /** @type {Map<string, number>} */
  const needByStock = new Map()
  for (const line of linesSnapshot) {
    const recipe = recipesByMenuItemId.get(line.menuItemId)
    if (!recipe) continue
    const servings = Number.parseInt(String(line.quantity ?? 0), 10) || 0
    if (servings <= 0) continue
    for (const ing of recipe.ingredients) {
      const stock = ing.stockItem
      if (!stock?.id || stock.active === false || stock.isBulk === true) continue
      const usedN = qtyInStockUnit(ing.quantity, servings, ing.unit, stock.unit)
      if (usedN <= 0) continue
      needByStock.set(stock.id, (needByStock.get(stock.id) ?? 0) + usedN)
    }
  }

  for (const [stockItemId, requiredN] of needByStock) {
    if (requiredN <= 0) continue
    const item = await prisma.stockItem.findUnique({
      where: { id: stockItemId },
    })
    if (!item) continue
    const before = parseQty(item.quantityOnHand) ?? 0
    if (before < requiredN) {
      throw new Error(
        `Main stock shortfall for ${item.nameEn || item.nameAr}: need ${requiredN}, on hand ${before}`,
      )
    }
    const after = formatQtyString(before - requiredN)
    await prisma.stockMovement.create({
      data: {
        businessProfileId,
        stockItemId,
        type: 'recipe_deduct',
        quantity: formatQtyString(requiredN),
        unit: item.unit,
        quantityBefore: formatQtyString(before),
        quantityAfter: after,
        reason: `Kitchen order #${orderNumber}`,
        note: SEED_NOTE,
        createdByUserId: userId,
        createdAt: at,
      },
    })
    await prisma.stockItem.update({
      where: { id: stockItemId },
      data: { quantityOnHand: after },
    })
  }

  await prisma.kitchenOrder.update({
    where: { id: kitchenOrderId },
    data: {
      status: 'completed',
      stockDeductedAt: at,
      completedAt: new Date(at.getTime() + 5 * 60 * 1000),
    },
  })
}

async function nextKitchenOrderNumber(prisma, businessProfileId, orderDate) {
  const row = await prisma.kitchenOrderCounter.upsert({
    where: {
      businessProfileId_orderDate: { businessProfileId, orderDate },
    },
    create: { businessProfileId, orderDate, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
    select: { lastNumber: true },
  })
  return row.lastNumber
}

async function deductMain(prisma, opts) {
  const { businessProfileId, userId, stockItemId, qty, reason, at } = opts
  if (qty <= 0) return
  const item = await prisma.stockItem.findUnique({ where: { id: stockItemId } })
  if (!item) return
  const before = parseQty(item.quantityOnHand) ?? 0
  if (before < qty) {
    throw new Error(
      `Day-end shortfall for ${item.nameEn || item.nameAr}: need ${qty}, on hand ${before}`,
    )
  }
  const after = formatQtyString(before - qty)
  await prisma.stockMovement.create({
    data: {
      businessProfileId,
      stockItemId,
      type: 'recipe_deduct',
      quantity: formatQtyString(qty),
      unit: item.unit,
      quantityBefore: formatQtyString(before),
      quantityAfter: after,
      reason,
      note: SEED_NOTE,
      createdByUserId: userId,
      createdAt: at,
    },
  })
  await prisma.stockItem.update({
    where: { id: stockItemId },
    data: { quantityOnHand: after },
  })
}

function realisticUserUsed(item, recipeN, dayOffset) {
  const name = (item.nameEn || '').toLowerCase()
  let pct = 0
  if (name.includes('chicken')) pct = dayOffset === 2 ? 0.055 : 0.02
  else if (name.includes('potato')) pct = 0.045
  else if (name.includes('flour')) pct = 0.035
  else if (name.includes('orange')) pct = 0.07
  else if (name.includes('beef')) pct = 0.015
  else if (name.includes('sauce') || name.includes('garlic') || name.includes('ranch')) {
    pct = 0.03
  }
  return recipeN * (1 + pct)
}

async function sumRecipeOilFromSales(prisma, opts) {
  const invoices = await prisma.invoice.findMany({
    where: {
      businessProfileId: opts.businessProfileId,
      status: 'completed',
      invoiceDate: { gte: opts.bounds.from, lte: opts.bounds.to },
    },
    select: { lines: { select: { nameEn: true, quantity: true } } },
  })
  let karahi = 0
  for (const inv of invoices) {
    for (const line of inv.lines) {
      const n = (line.nameEn || '').toLowerCase()
      if (n.includes('karahi')) karahi += Number(line.quantity) || 0
    }
  }
  return Number((karahi * FRYER_L.karahi).toFixed(3))
}

async function estimateBulkOilUsed(prisma, opts) {
  const invoices = await prisma.invoice.findMany({
    where: {
      businessProfileId: opts.businessProfileId,
      status: 'completed',
      invoiceDate: { gte: opts.bounds.from, lte: opts.bounds.to },
    },
    select: { lines: { select: { nameEn: true, quantity: true } } },
  })
  let fries = 0
  let broast = 0
  let karahi = 0
  for (const inv of invoices) {
    for (const line of inv.lines) {
      const n = (line.nameEn || '').toLowerCase()
      const qty = Number(line.quantity) || 0
      if (n.includes('fries')) fries += qty
      else if (n.includes('broast')) broast += qty
      else if (n.includes('karahi')) karahi += qty
    }
  }
  let liters =
    fries * FRYER_L.fries + broast * FRYER_L.broast + karahi * FRYER_L.karahi
  liters *= 0.95 + Math.random() * 0.22
  if (opts.dayOffset === 3) liters *= 1.28
  return Number(Math.max(0.4, liters).toFixed(3))
}

async function seedDayEndReports(prisma, opts) {
  const { businessProfileId, userId, todayRiyadh } = opts
  let created = 0

  for (let dayOffset = DAY_END_REPORTS; dayOffset >= 1; dayOffset--) {
    const reportDate = new Date(todayRiyadh)
    reportDate.setUTCDate(reportDate.getUTCDate() - dayOffset)
    const key = reportDateKey(reportDate)
    const submittedAt = new Date(`${key}T22:15:00+03:00`)
    const bounds = riyadhDayBounds(key)
    if (!bounds) continue

    const movements = await prisma.stockMovement.findMany({
      where: {
        businessProfileId,
        type: 'recipe_deduct',
        createdAt: { gte: bounds.from, lte: bounds.to },
        NOT: { reason: { startsWith: 'Day-end' } },
      },
      select: { stockItemId: true, quantity: true },
    })
    /** @type {Map<string, number>} */
    const usedByItem = new Map()
    for (const row of movements) {
      const n = parseQty(row.quantity) ?? 0
      usedByItem.set(row.stockItemId, (usedByItem.get(row.stockItemId) ?? 0) + n)
    }

    const oilRecipeN = await sumRecipeOilFromSales(prisma, {
      businessProfileId,
      bounds,
    })

    const [usedItems, bulkItems] = await Promise.all([
      usedByItem.size
        ? prisma.stockItem.findMany({
            where: {
              businessProfileId,
              id: { in: [...usedByItem.keys()] },
              isBulk: false,
            },
          })
        : [],
      prisma.stockItem.findMany({
        where: { businessProfileId, active: true, isBulk: true },
      }),
    ])

    const report = await prisma.stockDayEndReport.create({
      data: {
        businessProfileId,
        reportDate,
        status: 'submitted',
        submittedAt,
        submittedByUserId: userId,
      },
    })

    const rows = [...usedItems, ...bulkItems]
    for (const item of rows) {
      const recipeN = item.isBulk
        ? oilRecipeN
        : (usedByItem.get(item.id) ?? 0)
      const recipeUsed = formatQtyString(recipeN)
      let userN = recipeN
      if (item.isBulk) {
        userN = await estimateBulkOilUsed(prisma, {
          businessProfileId,
          bounds,
          dayOffset,
        })
        if (userN < recipeN) userN = recipeN
      } else {
        userN = realisticUserUsed(item, recipeN, dayOffset)
      }
      const userUsed = formatQtyString(userN)
      const waste = computeLineWaste(recipeUsed, userUsed, item.isBulk)
      await prisma.stockDayEndLine.create({
        data: {
          reportId: report.id,
          stockItemId: item.id,
          isBulk: item.isBulk,
          unit: item.unit,
          nameAr: item.nameAr,
          nameEn: item.nameEn,
          recipeUsed,
          userUsed,
          quantityWaste: waste.quantityWaste,
          wasteSeverity: waste.wasteSeverity,
        },
      })

      if (item.isBulk) {
        await deductMain(prisma, {
          businessProfileId,
          userId,
          stockItemId: item.id,
          qty: userN,
          reason: 'Day-end bulk used',
          at: submittedAt,
        })
      } else {
        const extra = Math.max(0, userN - recipeN)
        await deductMain(prisma, {
          businessProfileId,
          userId,
          stockItemId: item.id,
          qty: extra,
          reason: 'Day-end extra waste',
          at: submittedAt,
        })
      }
    }
    created += 1
  }

  logFlow(`Created ${created} submitted day-end reports`)
  return created
}

/**
 * @param {import('../../src/generated/prisma/client.ts').PrismaClient} prisma
 */
export async function seedFullKitchenFlow(prisma, opts) {
  const {
    profile,
    userId,
    menuItems,
    prefix,
    padding,
    stockByKey,
    allocateInvoiceNumber,
    computeInvoiceTotals,
    parseMoney,
    decimalStringFromNumber,
    buildSandboxQrPayload,
  } = opts
  void stockByKey

  const sellerName = profile.companyNameAr || profile.companyNameEn || 'Demo'
  const todayRiyadh = riyadhOrderDate()
  /** @type {Map<string, (typeof menuItems)[number]>} */
  const menuByEn = new Map()
  for (const item of menuItems) {
    const key = item.nameEn?.trim()
    if (key) menuByEn.set(key, item)
  }

  let invoices = 0
  let tickets = 0
  let deducted = 0
  let pendingLeft = 0

  for (let dayOffset = SALES_DAYS - 1; dayOffset >= 0; dayOffset--) {
    const orderDate = new Date(todayRiyadh)
    orderDate.setUTCDate(orderDate.getUTCDate() - dayOffset)
    const dayKey = reportDateKey(orderDate)
    const weekday = riyadhWeekday(dayKey)
    const ordersToday = ticketsForRiyadhDay(weekday, dayOffset === 0)
    const pendingToday = dayOffset === 0 ? Math.min(7, Math.max(4, Math.floor(ordersToday * 0.14))) : 0
    logFlow(
      `${dayKey} weekday=${weekday} tickets=${ordersToday}${pendingToday ? ` pending=${pendingToday}` : ''}`,
    )

    for (let i = 0; i < ordersToday; i++) {
      const clock = pickServiceClock()
      const invoiceDate = new Date(
        `${dayKey}T${clock.hh}:${clock.mm}:${clock.ss}+03:00`,
      )

      const rows = buildTicketRows(menuByEn, menuItems)
      const picked = rows.map((r) => r.item)

      const computeInput = rows.map((row) => ({
        quantity: row.qty,
        unitPrice: String(row.item.price),
        discount: '0.00',
        vatPreset: row.item.vatPreset,
      }))
      const totals = computeInvoiceTotals(computeInput)
      const grand = parseMoney(totals.grandTotal)
      const paymentMethod = Math.random() < 0.58 ? 'cash' : 'card'
      let tendered = null
      let changeGiven = null
      if (paymentMethod === 'cash') {
        const bump = [0, 0, 5, 10, 20][randInt(0, 4)]
        const rounded = Math.ceil((grand + bump) / 5) * 5
        tendered = decimalStringFromNumber(Math.max(rounded, Math.ceil(grand)))
        changeGiven = decimalStringFromNumber(parseMoney(tendered) - grand)
      }

      const invoiceNumber = await allocateInvoiceNumber(
        prisma,
        profile.id,
        prefix,
        padding,
      )
      const qrCode = buildSandboxQrPayload({
        sellerName,
        vatNumber: profile.vatNumber,
        timestamp: invoiceDate,
        grandTotal: totals.grandTotal,
        totalVat: totals.totalVat,
      })
      const stamp = Buffer.from(`${invoiceNumber}:${invoiceDate.toISOString()}`)
        .toString('hex')
        .slice(0, 64)
        .padEnd(64, '0')

      const invoice = await prisma.invoice.create({
        data: {
          businessProfileId: profile.id,
          invoiceNumber,
          status: 'completed',
          type: 'simplified',
          invoiceDate,
          createdAt: invoiceDate,
          updatedAt: invoiceDate,
          createdByStaffId: userId,
          sellerCompanyNameAr: profile.companyNameAr,
          sellerCompanyNameEn: profile.companyNameEn,
          sellerVatNumber: profile.vatNumber,
          sellerCrNumber: profile.crNumber,
          sellerAddressAr: profile.addressAr,
          sellerAddressEn: profile.addressEn,
          sellerStreetAr: profile.streetAr,
          sellerStreetEn: profile.streetEn,
          sellerDistrictAr: profile.districtAr,
          sellerDistrictEn: profile.districtEn,
          sellerCityAr: profile.cityAr,
          sellerCityEn: profile.cityEn,
          sellerBuildingNumber: profile.buildingNumber,
          sellerSecondaryNumber: profile.secondaryNumber,
          sellerPostalCode: profile.postalCode,
          sellerShortAddress: profile.shortAddress,
          sellerEmail: profile.email,
          sellerPhone: profile.phone,
          paymentMethod,
          amountTendered: tendered,
          changeGiven,
          subtotal: totals.subtotal,
          totalVat: totals.totalVat,
          grandTotal: totals.grandTotal,
          notes: SEED_NOTE,
          qrCode,
          cryptographicStamp: stamp,
          pih: stamp,
          zatcaStatus: 'reported',
          zatcaClearedAt: invoiceDate,
          zatcaReportAttempts: 1,
          zatcaLastAttemptAt: invoiceDate,
          zatcaLastError: null,
          lines: {
            create: picked.map((item, idx) => {
              const a = totals.perLine[idx]
              return {
                menuItemId: item.id,
                nameAr: item.nameAr,
                nameEn: item.nameEn,
                quantity: a.quantity,
                unitPrice: String(item.price),
                discount: a.discountStr,
                vatPreset: item.vatPreset,
                vatAmount: a.vatAmountStr,
                lineTotal: a.lineTotalStr,
                sortOrder: idx,
              }
            }),
          },
        },
      })
      invoices += 1

      const orderNumber = await nextKitchenOrderNumber(
        prisma,
        profile.id,
        orderDate,
      )
      const linesSnapshot = picked.map((item, idx) => ({
        menuItemId: item.id,
        nameAr: item.nameAr,
        nameEn: item.nameEn,
        quantity: computeInput[idx].quantity,
        lineNote: null,
        modifiersSnapshot: [],
      }))

      const leavePending = dayOffset === 0 && i >= ordersToday - pendingToday
      const ticket = await prisma.kitchenOrder.create({
        data: {
          businessProfileId: profile.id,
          invoiceId: invoice.id,
          orderNumber,
          orderDate,
          status: leavePending ? 'pending' : 'completed',
          linesSnapshot,
          itemsUpdatedAt: invoiceDate,
          createdAt: invoiceDate,
          updatedAt: invoiceDate,
        },
      })
      tickets += 1

      if (leavePending) {
        pendingLeft += 1
        continue
      }

      await deductKitchenReady(prisma, {
        businessProfileId: profile.id,
        userId,
        kitchenOrderId: ticket.id,
        orderNumber,
        linesSnapshot,
        at: new Date(invoiceDate.getTime() + 15 * 60 * 1000),
      })
      deducted += 1
    }
  }

  const dayEnds = await seedDayEndReports(prisma, {
    businessProfileId: profile.id,
    userId,
    todayRiyadh,
  })

  logFlow(
    `Sales ${invoices} invoices, ${tickets} kitchen tickets, ${deducted} deducted, ${pendingLeft} pending today`,
  )
  logFlow(`Day-end reports submitted: ${dayEnds}`)
  return { invoices, tickets, deducted, pendingLeft, dayEnds }
}
