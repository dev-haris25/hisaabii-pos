import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { getOrCreateBusinessSettings } from '@/lib/settings/get-or-create-business-settings'
import { analyzeDayEndReport } from '@/lib/stock/analyze-day-end-waste-gemini'
import { maybeEmitDayEndHighWasteAlert } from '@/lib/stock/emit-day-end-high-waste-alert'
import {
  applyAiEstimatesToLines,
  applyDayEndStockDeltas,
  computeDayEndLineWaste,
  computeDayEndStockDeductions,
  mapDayEndReportToJson,
} from '@/lib/stock/day-end-report'
import { parseQty } from '@/lib/stock/units'
import { prisma } from '@/lib/prisma'

export async function GET(request, { params }) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const { id } = await params
    const report = await prisma.stockDayEndReport.findFirst({
      where: { id, businessProfileId: auth.profile.id },
      include: { lines: { orderBy: { nameAr: 'asc' } } },
    })
    if (!report) return jsonError(404, 'NOT_FOUND', 'Day-end report not found')
    return jsonOk({ report: mapDayEndReportToJson(report) })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/stock/day-end/[id]')
  }
}

const patchSchema = z.object({
  submit: z.boolean().optional(),
  lines: z
    .array(
      z.object({
        id: z.string(),
        userUsed: z.string().nullable().optional(),
      }),
    )
    .min(1),
})

/** Thrown inside the save transaction so nothing from the request is committed. */
class DayEndSaveError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message
   * @param {unknown} [details]
   */
  constructor(status, code, message, details) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

/** @param {string} code */
function movementFailureStatus(code) {
  if (code === 'NOT_FOUND') return 404
  if (code === 'INSUFFICIENT_STOCK' || code === 'STOCK_ITEM_DELETED') return 409
  return 400
}

export async function PATCH(request, { params }) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const { id } = await params

    let raw
    try {
      raw = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }
    const parsed = patchSchema.safeParse(raw)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }
    const body = parsed.data
    const submit = body.submit === true

    /** @type {Map<string, string | null>} */
    const usedByLineId = new Map()
    for (const row of body.lines) {
      const text = row.userUsed == null ? '' : String(row.userUsed).trim()
      const userUsed = text === '' ? null : text
      if (userUsed != null) {
        const n = parseQty(userUsed)
        if (n == null || n < 0) {
          return jsonError(400, 'INVALID_QUANTITY', 'Enter a valid quantity')
        }
      }
      usedByLineId.set(row.id, userUsed)
    }

    const settings = await getOrCreateBusinessSettings(auth.profile.id)

    let saved
    try {
      saved = await prisma.$transaction(async (tx) => {
        // Lock the report row first: two simultaneous submits run one after
        // the other, and the second sees the first as already submitted.
        const locked = await tx.$queryRaw`SELECT "id" FROM "stock_day_end_reports" WHERE "id" = ${id} AND "businessProfileId" = ${auth.profile.id} FOR UPDATE`
        if (locked.length === 0) {
          throw new DayEndSaveError(404, 'NOT_FOUND', 'Day-end report not found')
        }
        const report = await tx.stockDayEndReport.findFirstOrThrow({
          where: { id, businessProfileId: auth.profile.id },
          include: { lines: true },
        })

        const storedIds = new Set(report.lines.map((l) => l.id))
        if ([...usedByLineId.keys()].some((lineId) => !storedIds.has(lineId))) {
          throw new DayEndSaveError(
            409,
            'DAY_END_REPORT_CHANGED',
            'This report changed. Reload the page and try again.',
          )
        }

        // Every line of the report counts; the body only overrides Used.
        const nextLines = report.lines.map((line) => {
          const userUsed = usedByLineId.has(line.id)
            ? usedByLineId.get(line.id) ?? null
            : line.userUsed
          const waste = computeDayEndLineWaste(line.recipeUsed, userUsed, line.isBulk)
          return {
            ...line,
            userUsed,
            quantityWaste: waste.quantityWaste,
            wasteSeverity: waste.wasteSeverity,
          }
        })

        if (
          submit &&
          nextLines.some(
            (line) => line.isBulk && (line.userUsed == null || line.userUsed.trim() === ''),
          )
        ) {
          throw new DayEndSaveError(
            400,
            'BULK_USED_REQUIRED',
            'Enter how much of each bulk item was used',
          )
        }

        const wasSubmitted = report.status === 'submitted'
        const shouldLockStock = submit || wasSubmitted
        if (shouldLockStock) {
          // A draft has deducted nothing yet; a submitted report already
          // deducted its stored values.
          const deductions = computeDayEndStockDeductions(
            nextLines,
            wasSubmitted ? report.lines : null,
          )
          const applied = await applyDayEndStockDeltas(tx, {
            deductions,
            businessProfileId: auth.profile.id,
            userId: auth.session.id,
            allowNegative: settings.allowNegativeStock === true,
          })
          if (!applied.ok) {
            const line = nextLines.find((l) => l.stockItemId === applied.stockItemId)
            throw new DayEndSaveError(
              movementFailureStatus(applied.code),
              applied.code || 'MOVEMENT_FAILED',
              applied.message || 'Movement failed',
              {
                stockItemId: applied.stockItemId,
                nameAr: line?.nameAr ?? null,
                nameEn: line?.nameEn ?? null,
              },
            )
          }
        }

        for (const line of nextLines) {
          if (!usedByLineId.has(line.id)) continue
          await tx.stockDayEndLine.update({
            where: { id: line.id },
            data: {
              userUsed: line.userUsed,
              quantityWaste: line.quantityWaste,
              wasteSeverity: line.wasteSeverity,
            },
          })
        }
        if (shouldLockStock) {
          await tx.stockDayEndReport.update({
            where: { id: report.id },
            data: {
              status: 'submitted',
              submittedAt: report.submittedAt ?? new Date(),
              submittedByUserId: report.submittedByUserId ?? auth.session.id,
            },
          })
        }
        return { shouldLockStock }
      }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)
    } catch (err) {
      if (err instanceof DayEndSaveError) {
        return jsonError(err.status, err.code, err.message, err.details)
      }
      throw err
    }
    const { shouldLockStock } = saved

    const fresh = await prisma.stockDayEndReport.findFirstOrThrow({
      where: { id, businessProfileId: auth.profile.id },
      include: { lines: { orderBy: { nameAr: 'asc' } } },
    })

    if (shouldLockStock) {
      try {
        const ai = await analyzeDayEndReport(prisma, {
          businessProfileId: auth.profile.id,
          report: fresh,
        })
        const withAi = applyAiEstimatesToLines(fresh.lines, ai.lineEstimates)
        if (withAi.length > 0) {
          await prisma.$transaction(
            withAi.map((line) =>
              prisma.stockDayEndLine.update({
                where: { id: line.id },
                data: {
                  quantityWaste: line.quantityWaste,
                  wasteSeverity: line.wasteSeverity,
                },
              }),
            ),
          )
        }
        const updated = await prisma.stockDayEndReport.update({
          where: { id: fresh.id },
          data: {
            aiAnalysis: ai.aiAnalysis,
            aiAnalyzedAt: ai.aiAnalyzedAt,
          },
          include: { lines: { orderBy: { nameAr: 'asc' } } },
        })
        await maybeEmitDayEndHighWasteAlert({
          businessProfileId: auth.profile.id,
          report: updated,
        })
        return jsonOk({ report: mapDayEndReportToJson(updated) })
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[day-end-ai]', err instanceof Error ? err.message : err)
        }
        return jsonOk({ report: mapDayEndReportToJson(fresh) })
      }
    }

    return jsonOk({ report: mapDayEndReportToJson(fresh) })
  } catch (err) {
    return handleRouteError(err, 'PATCH /api/auth/stock/day-end/[id]')
  }
}
