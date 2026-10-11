import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
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

const DAY_END_LINE_FIELDS = /** @type {const} */ ([
  'isBulk',
  'unit',
  'nameAr',
  'nameEn',
  'recipeUsed',
  'userUsed',
  'quantityWaste',
  'wasteSeverity',
])

/**
 * Build / refresh draft lines: recipe items used today + all active bulk items.
 *
 * Runs in one transaction under the same report row lock as the submit route
 * (`SELECT … FOR UPDATE` on stock_day_end_reports), so it never rewrites a
 * report that a submit is committing; a report that is submitted by the time
 * the lock is taken is returned unchanged. Lines are rebuilt in place, matched
 * by stockItemId, so line ids stay stable across page views.
 *
 * @param {import('@/generated/prisma/client').PrismaClient} db Root client (not a transaction).
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

  return db.$transaction(async (tx) => {
    // Get or create without racing: ON CONFLICT DO NOTHING, so two
    // simultaneous "Open today" requests end with one row and no error.
    await tx.stockDayEndReport.createMany({
      data: [
        {
          businessProfileId: opts.businessProfileId,
          reportDate,
          status: 'draft',
        },
      ],
      skipDuplicates: true,
    })
    const { id: reportId } = await tx.stockDayEndReport.findUniqueOrThrow({
      where: {
        businessProfileId_reportDate: {
          businessProfileId: opts.businessProfileId,
          reportDate,
        },
      },
      select: { id: true },
    })
    await tx.$queryRaw`SELECT "id" FROM "stock_day_end_reports" WHERE "id" = ${reportId} AND "businessProfileId" = ${opts.businessProfileId} FOR UPDATE`

    const existing = await tx.stockDayEndReport.findUniqueOrThrow({
      where: { id: reportId },
      include: { lines: true },
    })

    if (existing.status === 'submitted') {
      return existing
    }

    const prevByItem = new Map(
      existing.lines.map((l) => [l.stockItemId, l]),
    )

    const seen = new Set()
    const rows = []
    for (const item of [...usedItems, ...bulkItems]) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      rows.push(item)
    }

    /** @type {Array<Record<string, unknown>>} */
    const toCreate = []
    /** @type {Set<string>} */
    const keptLineIds = new Set()
    for (const item of rows) {
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
      const values = {
        isBulk: item.isBulk,
        unit: item.unit,
        nameAr: item.nameAr,
        nameEn: item.nameEn,
        recipeUsed,
        userUsed,
        quantityWaste: waste.quantityWaste,
        wasteSeverity: waste.wasteSeverity,
      }
      if (prev) {
        keptLineIds.add(prev.id)
        if (DAY_END_LINE_FIELDS.some((field) => prev[field] !== values[field])) {
          await tx.stockDayEndLine.update({ where: { id: prev.id }, data: values })
        }
      } else {
        toCreate.push({ reportId, stockItemId: item.id, ...values })
      }
    }

    // Items no longer in the set, plus any duplicate line for one item.
    const staleIds = existing.lines
      .filter((l) => !keptLineIds.has(l.id))
      .map((l) => l.id)
    if (staleIds.length > 0) {
      await tx.stockDayEndLine.deleteMany({ where: { id: { in: staleIds } } })
    }
    if (toCreate.length > 0) {
      await tx.stockDayEndLine.createMany({ data: toCreate })
    }

    return tx.stockDayEndReport.findUniqueOrThrow({
      where: { id: reportId },
      include: {
        lines: { include: { stockItem: { select: { unitCost: true, isBulk: true, nameEn: true, nameAr: true, unit: true } } } },
      },
    })
  }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)
}

/**
 * Warehouse qty a day-end line stands for: bulk = the full Used (bulk is never
 * deducted on kitchen ready); non-bulk = only the extra above recipe use.
 *
 * @param {{ isBulk: boolean, recipeUsed: string, userUsed: string | null }} line
 */
function dayEndLineDeductQty(line) {
  const userN = parseQty(line.userUsed ?? '')
  if (userN == null || userN < 0) return 0
  if (line.isBulk) return userN
  const recipeN = parseQty(line.recipeUsed ?? '0') ?? 0
  return Math.max(0, userN - recipeN)
}

/**
 * Pure: stock to deduct for a day-end save.
 *
 * `baseline` = the lines as they were already deducted — the stored lines of a
 * report that was submitted before this request. Pass null on the first submit
 * of a draft: nothing has been deducted yet, whatever values the draft holds.
 * Lowering Used never returns stock (only increases are deducted).
 *
 * @param {Array<{ id: string, stockItemId: string, isBulk: boolean, recipeUsed: string, userUsed: string | null }>} lines
 * @param {Array<{ id: string, isBulk: boolean, recipeUsed: string, userUsed: string | null }> | null} baseline
 * @returns {Array<{ stockItemId: string, isBulk: boolean, quantity: string }>}
 */
export function computeDayEndStockDeductions(lines, baseline) {
  const baselineById = new Map((baseline ?? []).map((l) => [l.id, l]))
  /** @type {Array<{ stockItemId: string, isBulk: boolean, quantity: string }>} */
  const deductions = []
  for (const line of lines) {
    const prev = baselineById.get(line.id)
    const already = prev ? dayEndLineDeductQty(prev) : 0
    const quantity = formatQtyString(dayEndLineDeductQty(line) - already)
    if ((parseQty(quantity) ?? 0) <= 0) continue
    deductions.push({ stockItemId: line.stockItemId, isBulk: line.isBulk, quantity })
  }
  return deductions
}

/**
 * Write the `recipe_deduct` movements from `computeDayEndStockDeductions`.
 * Stops at the first failure; the caller must roll back the transaction.
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx
 * @param {{
 *   deductions: Array<{ stockItemId: string, isBulk: boolean, quantity: string }>
 *   businessProfileId: string
 *   userId?: string | null
 *   allowNegative?: boolean
 * }} opts
 * @returns {Promise<{ ok: true } | { ok: false, code: string, message: string, stockItemId: string }>}
 */
export async function applyDayEndStockDeltas(tx, opts) {
  // Ascending stockItemId so concurrent multi-item movements (kitchen ready,
  // another submit) lock rows in the same order and never deadlock.
  const ordered = [...opts.deductions].sort((a, b) =>
    a.stockItemId < b.stockItemId ? -1 : a.stockItemId > b.stockItemId ? 1 : 0,
  )
  for (const d of ordered) {
    const result = await applyStockMovement(tx, {
      businessProfileId: opts.businessProfileId,
      stockItemId: d.stockItemId,
      type: 'recipe_deduct',
      quantity: d.quantity,
      reason: d.isBulk ? 'Day-end bulk used' : 'Day-end extra waste',
      createdByUserId: opts.userId ?? null,
      allowNegative: opts.allowNegative === true,
    })
    if (!result.ok) {
      return {
        ok: false,
        code: result.code,
        message: result.message,
        stockItemId: d.stockItemId,
      }
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
