import { maybeEmitHighWasteAlert } from '@/lib/stock/emit-high-waste-alert'
import { kitchenWasteAiResultUpdateData } from '@/lib/stock/kitchen-waste-ai-result'
import { analyzeKitchenWasteWithGemini } from '@/lib/stock/analyze-kitchen-waste-gemini'
import { buildKitchenWasteAiPayload } from '@/lib/stock/build-kitchen-waste-ai-payload'
import { parseQty, formatQtyString } from '@/lib/stock/units'
import { prisma } from '@/lib/prisma'

/**
 * Clamp bulk AI qty to the issued amount so a bad model cannot explode the ledger waste field.
 * @param {string | null} raw
 * @param {number} issuedN
 */
function clampQty(raw, issuedN) {
  const n = parseQty(raw ?? '')
  if (n == null || n < 0) return null
  const cap = Math.max(0, issuedN)
  return formatQtyString(Math.min(n, cap))
}

/**
 * Run Gemini after a kitchen batch is closed. Failures are logged; close still succeeds.
 *
 * @param {{ businessProfileId: string, allocationId: string }} opts
 */
export async function runKitchenWasteAi(opts) {
  try {
    const payload = await buildKitchenWasteAiPayload(prisma, opts)
    if (!payload) return { ok: false, skipped: true }

    const result = await analyzeKitchenWasteWithGemini(payload)
    const issuedN = parseQty(payload.issued) ?? 0

    const update = kitchenWasteAiResultUpdateData({
      isBulk: payload.isBulk,
      wasteSeverity: result.wasteSeverity,
      aiAnalysis: result.aiAnalysis,
      aiQuantityUsed: payload.isBulk
        ? clampQty(result.aiQuantityUsed, issuedN)
        : null,
      quantityWaste: payload.isBulk
        ? clampQty(result.quantityWaste, issuedN)
        : null,
    })
    if (!update.ok) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[kitchen-waste-ai] invalid result', update.code)
      }
      return { ok: false, code: update.code }
    }

    const allocation = await prisma.kitchenStockAllocation.update({
      where: { id: opts.allocationId },
      data: update.data,
      include: {
        stockItem: {
          select: {
            id: true,
            nameAr: true,
            nameEn: true,
            unit: true,
            quantityOnHand: true,
            isBulk: true,
            active: true,
          },
        },
      },
    })
    if (allocation.wasteSeverity === 'high') {
      await maybeEmitHighWasteAlert({
        businessProfileId: opts.businessProfileId,
        allocation,
      })
    }

    return { ok: true, allocation }
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        '[kitchen-waste-ai]',
        err instanceof Error ? err.message : err,
      )
    }
    return { ok: false }
  }
}
