import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { analyzeDayEndReport } from '@/lib/stock/analyze-day-end-waste-gemini'
import { maybeEmitDayEndHighWasteAlert } from '@/lib/stock/emit-day-end-high-waste-alert'
import {
  applyAiEstimatesToLines,
  applyDayEndStockDeltas,
  computeDayEndLineWaste,
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

export async function PATCH(request, { params }) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const { id } = await params
    const body = patchSchema.parse(await request.json())

    const existing = await prisma.stockDayEndReport.findFirst({
      where: { id, businessProfileId: auth.profile.id },
      include: { lines: true },
    })
    if (!existing) return jsonError(404, 'NOT_FOUND', 'Day-end report not found')

    const byId = new Map(existing.lines.map((l) => [l.id, l]))
    const nextLines = []
    for (const row of body.lines) {
      const line = byId.get(row.id)
      if (!line) continue
      const raw = row.userUsed
      if (line.isBulk) {
        if (body.submit === true && (raw == null || String(raw).trim() === '')) {
          return jsonError(
            400,
            'BULK_USED_REQUIRED',
            'Enter how much of each bulk item was used',
          )
        }
      }
      const userUsed =
        raw == null || String(raw).trim() === '' ? null : String(raw).trim()
      if (userUsed != null && parseQty(userUsed) == null) {
        return jsonError(400, 'INVALID_QUANTITY', 'Enter a valid quantity')
      }
      const waste = computeDayEndLineWaste(line.recipeUsed, userUsed, line.isBulk)
      nextLines.push({
        ...line,
        userUsed,
        quantityWaste: waste.quantityWaste,
        wasteSeverity: waste.wasteSeverity,
      })
    }

    const shouldLockStock =
      body.submit === true || existing.status === 'submitted'

    const delta = await prisma.$transaction(async (tx) => {
      if (shouldLockStock) {
        const applied = await applyDayEndStockDeltas(tx, {
          report: existing,
          lines: nextLines,
          previous: existing.lines,
          businessProfileId: auth.profile.id,
          userId: auth.session.id,
        })
        if (!applied.ok) return applied
      }
      for (const line of nextLines) {
        await tx.stockDayEndLine.update({
          where: { id: line.id },
          data: {
            userUsed: line.userUsed,
            quantityWaste: line.quantityWaste,
            wasteSeverity: line.wasteSeverity,
          },
        })
      }
      await tx.stockDayEndReport.update({
        where: { id: existing.id },
        data:
          shouldLockStock
            ? {
                status: 'submitted',
                submittedAt: existing.submittedAt ?? new Date(),
                submittedByUserId: existing.submittedByUserId ?? auth.session.id,
              }
            : {},
      })
      return { ok: true }
    })
    if (!delta.ok) {
      return jsonError(
        409,
        'INSUFFICIENT_STOCK',
        'Not enough stock to record day-end used quantities',
      )
    }

    const fresh = await prisma.stockDayEndReport.findFirstOrThrow({
      where: { id: existing.id },
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
