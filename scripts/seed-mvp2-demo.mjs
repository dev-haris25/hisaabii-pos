/**
 * Reseed muhammedharisnadeem@gmail.com for deduct-on-ready + day-end reports.
 *
 * PRESERVES: email, password, menu, ZATCA device
 * RESETS: sales, day-end reports, stock items/movements/recipes
 * SEEDS: stock + recipes, purchases, 7 Riyadh days of shop-volume invoices,
 *        ready-deduct from main (skip bulk), 6 submitted day-end reports + Gemini
 *
 * Run: bun run db:seed-mvp2-demo
 */
import {
  computeInvoiceTotals,
  decimalStringFromNumber,
  parseMoney,
} from '../src/lib/invoices/invoice-compute-totals.js'
import { enrichSalesForWasteAi } from '../src/lib/stock/analyze-kitchen-waste-gemini.js'
import {
  dayEndLinesForAi,
  dayEndWasteResponseSchema,
  dayEndWasteSystemText,
} from '../src/lib/stock/analyze-day-end-waste-gemini.js'
import { createPrisma } from './seed-demo-dev/db.mjs'
import { maybeEmitDayEndHighWasteAlert } from '../src/lib/stock/emit-day-end-high-waste-alert.js'
import { ensureRecipes } from './seed-demo-dev/ensure-recipes.mjs'
import { ensureStockItems } from './seed-demo-dev/ensure-stock.mjs'
import { ensureKarahiMenuItem } from './seed-demo-dev/ensure-karahi.mjs'
import { seedFullKitchenFlow } from './seed-demo-dev/seed-full-kitchen-flow.mjs'

const DEMO_EMAIL = 'muhammedharisnadeem@gmail.com'
const SEED_NOTE = 'SEED_KITCHEN_STOCK_V1'

function parseQty(v) {
  const n = Number.parseFloat(String(v ?? '').trim())
  return Number.isFinite(n) ? n : null
}

function formatQtyString(n) {
  const rounded = Math.round(n * 1000) / 1000
  return String(rounded)
}

function log(msg) {
  console.info(`[seed-mvp2-demo] ${msg}`)
}

/** @param {number} tag @param {string} value */
function tlvTag(tag, value) {
  const buf = Buffer.from(String(value ?? ''), 'utf8')
  if (buf.length > 255) {
    return Buffer.concat([Buffer.from([tag, 255]), buf.subarray(0, 255)])
  }
  return Buffer.concat([Buffer.from([tag, buf.length]), buf])
}

function buildSandboxQrPayload(opts) {
  const payload = Buffer.concat([
    tlvTag(1, opts.sellerName),
    tlvTag(2, opts.vatNumber),
    tlvTag(3, opts.timestamp.toISOString()),
    tlvTag(4, opts.grandTotal),
    tlvTag(5, opts.totalVat),
  ])
  return payload.toString('base64')
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1))
}

/** @template T @param {T[]} arr */
function formatInvoiceNumber(n, prefix = 'INV-', padding = 4) {
  return `${prefix}${String(n).padStart(padding, '0')}`
}

async function allocateInvoiceNumber(prisma, businessProfileId, prefix, padding) {
  const row = await prisma.invoiceCounter.upsert({
    where: { businessProfileId },
    create: { businessProfileId, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
    select: { lastNumber: true },
  })
  return formatInvoiceNumber(row.lastNumber, prefix, padding)
}

async function clearSalesAndStock(prisma, businessProfileId) {
  const invCount = await prisma.invoice.count({ where: { businessProfileId } })
  if (invCount > 0) {
    await prisma.creditNote.deleteMany({ where: { businessProfileId } })
    await prisma.debitNote.deleteMany({ where: { businessProfileId } })
    await prisma.invoice.deleteMany({ where: { businessProfileId } })
    log(`Deleted ${invCount} invoices`)
  }

  await prisma.kitchenOrderCounter.deleteMany({ where: { businessProfileId } })
  await prisma.invoiceCounter.upsert({
    where: { businessProfileId },
    create: { businessProfileId, lastNumber: 0 },
    update: { lastNumber: 0 },
  })
  await prisma.creditNoteCounter.upsert({
    where: { businessProfileId },
    create: { businessProfileId, lastNumber: 0 },
    update: { lastNumber: 0 },
  })
  await prisma.debitNoteCounter.upsert({
    where: { businessProfileId },
    create: { businessProfileId, lastNumber: 0 },
    update: { lastNumber: 0 },
  })

  const dayEndDeleted = await prisma.stockDayEndReport.deleteMany({
    where: { businessProfileId },
  })
  log(`Deleted day-end reports: ${dayEndDeleted.count}`)
  await prisma.notification.deleteMany({
    where: { businessProfileId, type: 'day_end_waste_high' },
  })

  const allocDeleted = await prisma.kitchenStockAllocation.deleteMany({
    where: { businessProfileId },
  })
  log(`Deleted kitchen allocations: ${allocDeleted.count}`)

  // legacy daily allotment if any remain
  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM stock_day_lines WHERE "stockDayId" IN (SELECT id FROM stock_days WHERE "businessProfileId" = $1)`,
      businessProfileId,
    )
    await prisma.$executeRawUnsafe(
      `DELETE FROM stock_days WHERE "businessProfileId" = $1`,
      businessProfileId,
    )
  } catch {
    // tables already dropped
  }

  const recipeIds = (
    await prisma.menuItemRecipe.findMany({
      where: { menuItem: { businessProfileId } },
      select: { id: true },
    })
  ).map((r) => r.id)
  if (recipeIds.length > 0) {
    await prisma.menuItemRecipeIngredient.deleteMany({
      where: { recipeId: { in: recipeIds } },
    })
    await prisma.menuItemRecipe.deleteMany({ where: { id: { in: recipeIds } } })
  }

  await prisma.stockMovement.deleteMany({ where: { businessProfileId } })
  const stockDeleted = await prisma.stockItem.deleteMany({
    where: { businessProfileId },
  })
  log(`Deleted stock items: ${stockDeleted.count}`)
}

async function seedPurchases(prisma, { businessProfileId, userId, stockByKey }) {
  const defs = [
    { key: 'chicken', qty: '80', cost: '18.00' },
    { key: 'potato', qty: '40', cost: '4.00' },
    { key: 'oil', qty: '20', cost: '9.00' },
    { key: 'beef', qty: '18', cost: '32.00' },
    { key: 'flour', qty: '20', cost: '3.50' },
    { key: 'cheese', qty: '80', cost: '0.60' },
    { key: 'bun', qty: '80', cost: '0.80' },
    { key: 'wrap', qty: '80', cost: '0.50' },
    { key: 'garlic_sauce', qty: '4000', cost: '0.02' },
    { key: 'ranch', qty: '2000', cost: '0.03' },
    { key: 'water_bottle', qty: '72', cost: '0.40' },
    { key: 'soda_can', qty: '96', cost: '1.20' },
    { key: 'orange', qty: '10', cost: '7.00' },
  ]
  let n = 0
  for (const def of defs) {
    const id = stockByKey.get(def.key)
    if (!id) continue
    const item = await prisma.stockItem.findUnique({ where: { id } })
    if (!item) continue
    const before = parseQty(item.quantityOnHand) ?? 0
    const add = parseQty(def.qty) ?? 0
    const after = formatQtyString(before + add)
    await prisma.stockMovement.create({
      data: {
        businessProfileId,
        stockItemId: id,
        type: 'purchase',
        quantity: def.qty,
        unit: item.unit,
        quantityBefore: formatQtyString(before),
        quantityAfter: after,
        reason: 'Seed purchase restock',
        note: SEED_NOTE,
        unitCost: def.cost,
        createdByUserId: userId,
        createdAt: new Date(Date.now() - randInt(5, 25) * 24 * 60 * 60 * 1000),
      },
    })
    await prisma.stockItem.update({
      where: { id },
      data: { quantityOnHand: after, unitCost: def.cost },
    })
    n += 1
  }
  log(`Created ${n} purchase restocks`)
}


function parseJsonObject(raw) {
  let t = String(raw ?? '').trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]) t = fence[1].trim()
  try {
    const obj = JSON.parse(t)
    return obj && typeof obj === 'object' ? obj : null
  } catch {
    return null
  }
}

function riyadhDayBounds(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null
  const from = new Date(`${isoDate}T00:00:00+03:00`)
  const to = new Date(`${isoDate}T23:59:59.999+03:00`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null
  return { from, to }
}

async function analyzeDayEndForSeed(prisma, report) {
  const key = report.reportDate.toISOString().slice(0, 10)
  const bounds = riyadhDayBounds(key)
  const invoices = bounds
    ? await prisma.invoice.findMany({
        where: {
          businessProfileId: report.businessProfileId,
          status: 'completed',
          invoiceDate: { gte: bounds.from, lte: bounds.to },
        },
        select: {
          lines: {
            select: { nameAr: true, nameEn: true, quantity: true, menuItemId: true },
          },
        },
        take: 400,
      })
    : []
  const sold = new Map()
  for (const inv of invoices) {
    for (const line of inv.lines) {
      const k = `${line.menuItemId || line.nameEn || line.nameAr}`
      const prev = sold.get(k)
      if (prev) prev.quantity += line.quantity
      else {
        sold.set(k, {
          nameAr: line.nameAr,
          nameEn: line.nameEn,
          quantity: line.quantity,
          menuItemId: line.menuItemId ?? null,
        })
      }
    }
  }
  const menuItemIds = [
    ...new Set([...sold.values()].map((s) => s.menuItemId).filter(Boolean)),
  ]
  const recipes = menuItemIds.length
    ? await prisma.menuItemRecipe.findMany({
        where: {
          menuItemId: { in: menuItemIds },
          menuItem: { businessProfileId: report.businessProfileId },
        },
        select: { menuItemId: true, steps: true, stepsAr: true },
      })
    : []
  const stepsByMenu = new Map(
    recipes.map((r) => [r.menuItemId, { steps: r.steps, stepsAr: r.stepsAr }]),
  )
  const salesInPeriod = enrichSalesForWasteAi(
    [...sold.values()].map((row) => {
      const rec = row.menuItemId ? stepsByMenu.get(row.menuItemId) : null
      return {
        nameAr: row.nameAr,
        nameEn: row.nameEn,
        quantity: row.quantity,
        steps: rec?.steps ?? '',
        stepsAr: rec?.stepsAr ?? '',
      }
    }),
  )
  const lines = dayEndLinesForAi(report.lines)
  const keyEnv = process.env.TRANSLATION_API_KEY?.trim()
  if (!keyEnv) throw new Error('TRANSLATION_API_KEY_MISSING')
  const preferred = process.env.GEMINI_TRANSLATION_MODEL?.trim() || 'gemini-2.0-flash'
  const fallback = 'gemini-2.5-flash'
  const systemText = dayEndWasteSystemText()
  const userText = JSON.stringify({
    date: key,
    lines,
    salesInPeriod,
  })
  async function generate(model) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(keyEnv)}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemText }] },
        contents: [{ parts: [{ text: userText }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 2048,
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: 'application/json',
          responseSchema: dayEndWasteResponseSchema(),
        },
      }),
    })
    const json = await res.json().catch(() => ({}))
    return { res, json }
  }
  let { res, json } = await generate(preferred)
  if ((res.status === 429 || res.status === 503) && preferred !== fallback) {
    ;({ res, json } = await generate(fallback))
  }
  if (!res.ok) {
    const msg = typeof json?.error?.message === 'string' ? json.error.message : `HTTP ${res.status}`
    throw new Error(msg)
  }
  const out = json.candidates?.[0]?.content?.parts?.[0]?.text
  const parsed = typeof out === 'string' ? parseJsonObject(out) : null
  const en = typeof parsed?.analysisEn === 'string' ? parsed.analysisEn.trim() : ''
  const ar = typeof parsed?.analysisAr === 'string' ? parsed.analysisAr.trim() : ''
  if (!en || !ar) throw new Error('EMPTY_WASTE_ANALYSIS')
  const lineEstimates = Array.isArray(parsed?.lineEstimates)
    ? parsed.lineEstimates
    : Array.isArray(parsed?.bulkWaste)
      ? parsed.bulkWaste
      : []
  return { aiAnalysis: `${en}\n<<<AR>>>\n${ar}`, aiAnalyzedAt: new Date(), lineEstimates }
}

async function runGeminiOnDayEndReports(prisma, businessProfileId) {
  if (!process.env.TRANSLATION_API_KEY?.trim()) {
    throw new Error('TRANSLATION_API_KEY_MISSING — cannot seed real Gemini reports')
  }
  const reports = await prisma.stockDayEndReport.findMany({
    where: { businessProfileId, status: 'submitted' },
    orderBy: { reportDate: 'asc' },
    include: { lines: true },
  })
  if (reports.length === 0) throw new Error('No submitted day-end reports to analyze')
  let ok = 0
  for (let i = 0; i < reports.length; i++) {
    const row = reports[i]
    log(`Gemini ${i + 1}/${reports.length}: ${row.reportDate.toISOString().slice(0, 10)} (${row.id})`)
    let ai
    try {
      ai = await analyzeDayEndForSeed(prisma, row)
    } catch (err) {
      log(`Gemini failed for ${row.id}: ${err instanceof Error ? err.message : err}`)
      if (i < reports.length - 1) await new Promise((r) => setTimeout(r, 2000))
      continue
    }
    await prisma.stockDayEndReport.update({
      where: { id: row.id },
      data: { aiAnalysis: ai.aiAnalysis, aiAnalyzedAt: ai.aiAnalyzedAt },
    })
    for (const bw of ai.lineEstimates ?? []) {
      const line = row.lines.find((l) => l.stockItemId === bw.stockItemId)
      if (!line) continue
      const sev = ['low', 'bearable', 'high'].includes(bw.wasteSeverity)
        ? bw.wasteSeverity
        : null
      /** @type {Record<string, unknown>} */
      const data = {}
      if (sev) data.wasteSeverity = sev
      if (line.isBulk) {
        const usedN = parseQty(line.userUsed ?? '') ?? 0
        const wasteN = parseQty(bw.quantityWaste ?? '')
        if (wasteN != null && wasteN >= 0 && usedN > 0) {
          data.quantityWaste = formatQtyString(Math.min(wasteN, usedN))
        }
      }
      if (Object.keys(data).length === 0) continue
      await prisma.stockDayEndLine.update({
        where: { id: line.id },
        data,
      })
    }
    const saved = await prisma.stockDayEndReport.findFirst({
      where: { id: row.id },
      include: { lines: true },
    })
    if (saved) {
      await maybeEmitDayEndHighWasteAlert({
        businessProfileId,
        report: saved,
      })
    }
    ok += 1
    if (i < reports.length - 1) await new Promise((r) => setTimeout(r, 1500))
  }
  log(`Gemini reports written: ${ok}/${reports.length}`)
}

async function main() {
  const prisma = createPrisma()
  try {
    const user = await prisma.user.findUnique({
      where: { email: DEMO_EMAIL },
      select: {
        id: true,
        email: true,
        activeBusinessProfileId: true,
        ownedBusinesses: { select: { id: true }, take: 1 },
      },
    })
    if (!user) throw new Error(`User not found: ${DEMO_EMAIL}`)
    const profileId =
      user.activeBusinessProfileId ?? user.ownedBusinesses[0]?.id
    if (!profileId) throw new Error('No business profile')

    const profile = await prisma.businessProfile.findUniqueOrThrow({
      where: { id: profileId },
    })
    const device = await prisma.zatcaDevice.findUnique({
      where: { businessProfileId: profileId },
      select: { id: true, invoiceCounter: true, onboardedAt: true },
    })

    log(`User ${user.email}`)
    log(`Profile ${profile.companyNameEn || profile.companyNameAr}`)
    log(
      `ZATCA preserved device=${!!device} onboardedAt=${device?.onboardedAt?.toISOString() ?? 'n/a'}`,
    )

    if (process.argv.includes('--gemini-only')) {
      await runGeminiOnDayEndReports(prisma, profileId)
      log('Gemini-only refresh done. Login/menu/ZATCA unchanged.')
      return
    }

    const menuCount = await prisma.menuItem.count({
      where: { businessProfileId: profileId },
    })
    if (menuCount === 0) throw new Error('Menu empty — abort')
    await ensureKarahiMenuItem(prisma, profileId)
    const menuAfter = await prisma.menuItem.count({
      where: { businessProfileId: profileId },
    })
    log(`Keeping menu (${menuAfter} items; Karahi added if missing)`)

    await clearSalesAndStock(prisma, profileId)

    await prisma.businessSettings.upsert({
      where: { businessProfileId: profileId },
      create: {
        businessProfileId: profileId,
        lowStockAlertsEnabled: true,
        allowNegativeStock: false,
      },
      update: {
        lowStockAlertsEnabled: true,
        allowNegativeStock: false,
      },
    })

    /** @type {Map<string, string>} */
    let stockByKey = new Map()
    await prisma.$transaction(
      async (tx) => {
        stockByKey = await ensureStockItems(tx, {
          businessProfileId: profileId,
          createdByUserId: user.id,
        })
        await ensureRecipes(tx, { businessProfileId: profileId, stockByKey })
      },
      { maxWait: 20_000, timeout: 120_000 },
    )

    await seedPurchases(prisma, {
      businessProfileId: profileId,
      userId: user.id,
      stockByKey,
    })

    const settings = await prisma.businessSettings.findUnique({
      where: { businessProfileId: profileId },
      select: { invoicePrefix: true, numberPadding: true },
    })
    const prefix = settings?.invoicePrefix || 'INV-'
    const padding = settings?.numberPadding ?? 4

    const menuItems = await prisma.menuItem.findMany({
      where: { businessProfileId: profileId, active: true },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        nameAr: true,
        nameEn: true,
        price: true,
        vatPreset: true,
      },
    })

    await seedFullKitchenFlow(prisma, {
      profile,
      userId: user.id,
      menuItems,
      prefix,
      padding,
      stockByKey,
      allocateInvoiceNumber,
      computeInvoiceTotals,
      parseMoney,
      decimalStringFromNumber,
      buildSandboxQrPayload,
    })

    await prisma.businessMembership.upsert({
      where: {
        userId_businessProfileId: {
          userId: user.id,
          businessProfileId: profileId,
        },
      },
      create: {
        userId: user.id,
        businessProfileId: profileId,
        emailHighWasteReports: true,
      },
      update: { emailHighWasteReports: true },
    })

    await runGeminiOnDayEndReports(prisma, profileId)

    const deviceAfter = await prisma.zatcaDevice.findUnique({
      where: { businessProfileId: profileId },
      select: { id: true, invoiceCounter: true },
    })
    if (device && deviceAfter && deviceAfter.id !== device.id) {
      throw new Error('ZATCA device changed')
    }

    log('Done. Login/password/menu/ZATCA unchanged.')
    log('Test: Invoices have kitchen tickets; ready deducted from main; Gemini on day-end reports')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error('[seed-mvp2-demo] failed:', err)
  process.exit(1)
})
