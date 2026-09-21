import { riyadhDayBounds, riyadhOrderDate } from '@/lib/orders/riyadh-order-date'
import { applyStockMovement } from '@/lib/stock/apply-stock-movement'
import {
  aggregateRecipeStockNeeds,
  loadRecipesByMenuItemIds,
} from '@/lib/stock/recipe-stock-needs'
import { formatQtyString, parseQty } from '@/lib/stock/units'

/**
 * @param {Date} reportDate
 */
export function reportDateKey(reportDate) {
  return reportDate.toISOString().slice(0, 10)
}

/**
 * @param {string} recipeUsed
 * @param {string | null | undefined} userUsed
 * @param {boolean} isBulk
 */
export function computeDayEndLineWaste(recipeUsed, userUsed, isBulk) {
  if (isBulk) {
    return { quantityWaste: '0', wasteSeverity: null }
  }
  const recipeN = parseQty(recipeUsed ?? '0') ?? 0
  const userN = parseQty(userUsed ?? '')
  if (userN == null) {
    return { quantityWaste: '0', wasteSeverity: null }
  }
  const waste = Math.max(0, userN - recipeN)
  return {
    quantityWaste: formatQtyString(waste),
    wasteSeverity: null,
  }
}

/**
 * Recipe qty for the day from ready tickets — includes bulk ingredients
 * (those are not deducted on ready).
 *
 * @param {import('@/generated/prisma/client').PrismaClient | import('@/generated/prisma/client').Prisma.TransactionClient} db
 * @param {string} businessProfileId
 * @param {Date} reportDate
 */
export async function sumRecipeNeedsForDay(db, businessProfileId, reportDate) {
  const key = reportDateKey(reportDate)
  const bounds = riyadhDayBounds(key)
  if (!bounds) return new Map()

  const tickets = await db.kitchenOrder.findMany({
    where: {
      businessProfileId,
      stockDeductedAt: { gte: bounds.from, lte: bounds.to },
    },
    select: { linesSnapshot: true },
  })

  /** @type {Array<{ menuItemId?: string | null, quantity?: number }>} */
  const lines = []
  for (const ticket of tickets) {
    if (!Array.isArray(ticket.linesSnapshot)) continue
    for (const line of ticket.linesSnapshot) {
      if (line && typeof line === 'object') lines.push(line)
    }
  }

  const menuItemIds = [
    ...new Set(lines.map((l) => l.menuItemId).filter(Boolean)),
  ]
  const recipes = await loadRecipesByMenuItemIds(
    db,
    businessProfileId,
    menuItemIds,
  )
  const { needs } = aggregateRecipeStockNeeds(lines, recipes)
  /** @type {Map<string, number>} */
  const byItem = new Map()
  for (const need of needs) {
    byItem.set(need.stockItemId, parseQty(need.required) ?? 0)
  }
  return byItem
}

/**
 * Build / refresh draft lines: recipe items used today + all active bulk items.
 * @param {import('@/generated/prisma/client').PrismaClient} db
 * @param {{ businessProfileId: string, reportDate?: Date, userId?: string }} opts
 */
export async function ensureDayEndDraft(db, opts) {
  const reportDate = opts.reportDate ?? riyadhOrderDate()
  const usedByItem = await sumRecipeNeedsForDay(
    db,
    opts.businessProfileId,
    reportDate,
  )

  const [usedItems, bulkItems] = await Promise.all([
    usedByItem.size
      ? db.stockItem.findMany({
          where: {
            businessProfileId: opts.businessProfileId,
            id: { in: [...usedByItem.keys()] },
          },
        })
      : [],
    db.stockItem.findMany({
      where: { businessProfileId: opts.businessProfileId, active: true, isBulk: true },
    }),
  ])

  const existing = await db.stockDayEndReport.findUnique({
    where: {
      businessProfileId_reportDate: {
        businessProfileId: opts.businessProfileId,
        reportDate,
      },
    },
    include: { lines: true },
  })

  if (existing?.status === 'submitted') {
    return existing
  }

  const report =
    existing ??
    (await db.stockDayEndReport.create({
      data: {
        businessProfileId: opts.businessProfileId,
        reportDate,
        status: 'draft',
      },
    }))

  const prevByItem = new Map(
    (existing?.lines ?? []).map((l) => [l.stockItemId, l]),
  )

  await db.stockDayEndLine.deleteMany({ where: { reportId: report.id } })

  const seen = new Set()
  const rows = []
  for (const item of [...usedItems, ...bulkItems]) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    rows.push(item)
  }
  if (rows.length > 0) {
    await db.stockDayEndLine.createMany({
      data: rows.map((item) => {
        const recipeN = usedByItem.get(item.id) ?? 0
        const recipeUsed = formatQtyString(recipeN)
        const prev = prevByItem.get(item.id)
        const prevUser = prev?.userUsed ?? null
        const prevRecipe = prev?.recipeUsed ?? null
        const edited =
          prevUser != null &&
          prevUser !== '' &&
          prevRecipe != null &&
          prevUser !== prevRecipe
        let userUsed = prevUser
        if (!edited) {
          userUsed = recipeN > 0 ? recipeUsed : null
        }
        const waste = computeDayEndLineWaste(recipeUsed, userUsed, item.isBulk)
        return {
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
        }
      }),
    })
  }

  return db.stockDayEndReport.findUniqueOrThrow({
    where: { id: report.id },
    include: {
      lines: { include: { stockItem: { select: { unitCost: true, isBulk: true, nameEn: true, nameAr: true, unit: true } } } },
    },
  })
}

/**
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx
 * @param {{
 *   report: { id: string, status: string }
 *   lines: Array<{ stockItemId: string, isBulk: boolean, recipeUsed: string, userUsed: string | null }>
 *   previous?: Array<{ stockItemId: string, userUsed: string | null, isBulk: boolean }>
 *   businessProfileId: string
 *   userId?: string | null
 * }} opts
 */
export async function applyDayEndStockDeltas(tx, opts) {
  const prevBy = new Map(
    (opts.previous ?? []).map((l) => [l.stockItemId, l]),
  )
  for (const line of opts.lines) {
    const userN = parseQty(line.userUsed ?? '')
    if (userN == null || userN < 0) continue
    const recipeN = parseQty(line.recipeUsed ?? '0') ?? 0
    const prev = prevBy.get(line.stockItemId)
    const prevUser = parseQty(prev?.userUsed ?? '')

    let nextDeduct = 0
    if (line.isBulk) {
      nextDeduct = userN
    } else {
      nextDeduct = Math.max(0, userN - recipeN)
    }
    let prevDeduct = 0
    if (prev) {
      if (line.isBulk) {
        prevDeduct = prevUser ?? 0
      } else {
        prevDeduct = prevUser != null ? Math.max(0, prevUser - recipeN) : 0
      }
    }
    const delta = nextDeduct - prevDeduct
    if (delta <= 0) continue
    const result = await applyStockMovement(tx, {
      businessProfileId: opts.businessProfileId,
      stockItemId: line.stockItemId,
      type: 'recipe_deduct',
      quantity: formatQtyString(delta),
      reason: line.isBulk ? 'Day-end bulk used' : 'Day-end extra waste',
      createdByUserId: opts.userId ?? null,
    })
    if (!result.ok) {
      return { ok: false, code: result.code, stockItemId: line.stockItemId }
    }
  }
  return { ok: true }
}

const WASTE_SEVERITIES = new Set(['low', 'bearable', 'high'])

/**
 * Apply Gemini estimates: waste qty for bulk, severity for any line.
 *
 * @param {Array<{ stockItemId: string, userUsed?: string | null, isBulk?: boolean, quantityWaste?: string, wasteSeverity?: string | null }>} lines
 * @param {Array<{ stockItemId?: string, quantityWaste?: string, wasteSeverity?: string }>} estimates
 */
export function applyAiEstimatesToLines(lines, estimates) {
  const byId = new Map(
    (estimates ?? [])
      .filter((row) => row && typeof row.stockItemId === 'string')
      .map((row) => [row.stockItemId, row]),
  )
  return lines.map((line) => {
    const ai = byId.get(line.stockItemId)
    if (!ai) return line
    const severity =
      typeof ai.wasteSeverity === 'string' && WASTE_SEVERITIES.has(ai.wasteSeverity)
        ? ai.wasteSeverity
        : line.wasteSeverity
    if (line.isBulk !== true) {
      return { ...line, wasteSeverity: severity ?? line.wasteSeverity }
    }
    const usedN = parseQty(line.userUsed ?? '') ?? 0
    const rawWaste = parseQty(ai.quantityWaste ?? '')
    if (rawWaste == null || rawWaste < 0 || usedN <= 0) {
      return { ...line, wasteSeverity: severity ?? line.wasteSeverity }
    }
    return {
      ...line,
      quantityWaste: formatQtyString(Math.min(rawWaste, usedN)),
      wasteSeverity: severity ?? line.wasteSeverity,
    }
  })
}

/**
 * @param {import('@/generated/prisma/client').PrismaClient} db
 * @param {string} businessProfileId
 */
export async function listDayEndReports(db, businessProfileId, opts = {}) {
  const skip = opts.skip ?? 0
  const take = opts.take ?? 10
  const where = { businessProfileId }
  if (opts.from || opts.to) {
    where.reportDate = {}
    if (opts.from) where.reportDate.gte = opts.from
    if (opts.to) where.reportDate.lte = opts.to
  }
  const [total, rows] = await Promise.all([
    db.stockDayEndReport.count({ where }),
    db.stockDayEndReport.findMany({
      where,
      orderBy: { reportDate: 'desc' },
      skip,
      take,
      include: {
        lines: { select: { quantityWaste: true, isBulk: true, wasteSeverity: true } },
      },
    }),
  ])
  return { total, reports: rows }
}

export function mapDayEndReportToJson(report) {
  return {
    id: report.id,
    reportDate: reportDateKey(report.reportDate),
    status: report.status,
    submittedAt: report.submittedAt?.toISOString() ?? null,
    aiAnalysis: report.aiAnalysis ?? null,
    aiAnalyzedAt: report.aiAnalyzedAt?.toISOString() ?? null,
    lines: (report.lines ?? []).map((line) => ({
      id: line.id,
      stockItemId: line.stockItemId,
      isBulk: line.isBulk,
      unit: line.unit,
      nameAr: line.nameAr,
      nameEn: line.nameEn,
      recipeUsed: line.recipeUsed,
      userUsed: line.userUsed,
      quantityWaste: line.quantityWaste,
      wasteSeverity: line.wasteSeverity,
    })),
  }
}
