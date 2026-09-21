import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { riyadhDayBounds } from '@/lib/orders/riyadh-order-date'
import { enrichSalesForWasteAi } from '@/lib/stock/analyze-kitchen-waste-gemini'

const FALLBACK_MODEL = 'gemini-2.5-flash'

/**
 * Bulk lines omit waste — the stored 0 is a placeholder until the model estimates it.
 * @param {Array<Record<string, any>>} lines
 */
export function dayEndLinesForAi(lines) {
  return (lines ?? []).map((l) => {
    const isBulk = l.isBulk === true
    /** @type {Record<string, unknown>} */
    const row = {
      stockItemId: l.stockItemId,
      name: l.nameEn || l.nameAr,
      isBulk,
      unit: l.unit,
      recipeUsed: l.recipeUsed,
      used: l.userUsed,
    }
    if (!isBulk) row.waste = l.quantityWaste
    return row
  })
}

export function dayEndWasteSystemText() {
  return [
    'You write a day-end kitchen stock report for a restaurant owner (Hisabi POS).',
    'Use only the JSON. Write analysisEn and analysisAr as 3–6 readable sentences, not a stats dump.',
    'There is one Used number per item (the owner may edit it). recipeUsed is the measured qty already written on recipes that day, including bulk poured into a dish.',
    'For non-bulk items: waste is already in the JSON (extra above recipeUsed). Explain that number. Do not change it. If waste is 0, say they matched the recipes. Still set wasteSeverity.',
    'For bulk items: the JSON has no waste number. You must estimate quantityWaste. Read the full recipeSteps and recipeStepsAr (the cook method the restaurant wrote) and the dish counts in salesInPeriod. Decide which dishes use this bulk item and estimate a per-portion rate yourself in that item’s unit.',
    'recipeUsed is only the measured amount on the recipe. Your rate covers extra process loss the steps imply but do not quantify (left in the vessel, filtered out, evaporated, discarded).',
    'quantityWaste is that discarded amount. Return a number greater than 0 when the steps show the item is used in cooking and Used is greater than 0. Return 0 only when the steps show nothing was discarded. Keep 0 ≤ quantityWaste ≤ Used.',
    'wasteSeverity high means this line needs attention. For every bulk item, do not set high only because quantityWaste or Used is large. First account for the dishes sold and the recipe steps: busy sales of dishes that use this bulk item explain a large Used. Set high only when, after that expected use, the discarded share still looks excessive. If the use is explained by what was sold, set low or bearable.',
    'The written analysis and wasteSeverity must agree. If you explain a bulk item by the dishes sold, do not say it needs attention.',
    'On each bulk lineEstimates row, set reason to the dishes, your per-portion rate, the expected use, and why the severity is or is not high.',
    'For non-bulk items, set wasteSeverity from the extra above recipeUsed.',
    'Return one lineEstimates row per stock line. Copy stockItemId exactly. Include quantityWaste, wasteSeverity, and reason on every row.',
    'Mention Used, your estimated waste, and how many of each dish sold. Do not recommend issuing kitchen boxes. Arabic must be natural MSA with the same numbers.',
  ].join(' ')
}

export function dayEndWasteResponseSchema() {
  return {
    type: 'OBJECT',
    properties: {
      analysisEn: { type: 'STRING' },
      analysisAr: { type: 'STRING' },
      lineEstimates: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            stockItemId: { type: 'STRING' },
            quantityWaste: { type: 'STRING' },
            wasteSeverity: { type: 'STRING', enum: ['low', 'bearable', 'high'] },
            reason: { type: 'STRING' },
          },
          required: ['stockItemId', 'quantityWaste', 'wasteSeverity', 'reason'],
        },
      },
    },
    required: ['analysisEn', 'analysisAr', 'lineEstimates'],
  }
}

function parseJsonObject(raw) {
  let s = String(raw ?? '').trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]) s = fence[1].trim()
  try {
    const obj = JSON.parse(s)
    return obj && typeof obj === 'object' ? obj : null
  } catch {
    return null
  }
}

/**
 * One write-up for the day-end report. Non-bulk waste is already computed.
 * Bulk waste is estimated by the model from recipe steps and dishes sold.
 *
 * @param {import('@/generated/prisma/client').PrismaClient} db
 * @param {{ businessProfileId: string, report: Record<string, any> }} opts
 */
export async function analyzeDayEndReport(db, opts) {
  const key =
    opts.report.reportDate instanceof Date
      ? opts.report.reportDate.toISOString().slice(0, 10)
      : String(opts.report.reportDate).slice(0, 10)
  const bounds = riyadhDayBounds(key)

  const invoices = bounds
    ? await db.invoice.findMany({
        where: {
          businessProfileId: opts.businessProfileId,
          status: 'completed',
          ...WHERE_NOT_DELETED,
          invoiceDate: { gte: bounds.from, lte: bounds.to },
        },
        select: {
          lines: {
            select: {
              nameAr: true,
              nameEn: true,
              quantity: true,
              menuItemId: true,
            },
          },
        },
        take: 400,
      })
    : []

  /** @type {Map<string, { nameAr: string, nameEn: string | null, quantity: number, menuItemId: string | null }>} */
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
    ...new Set(
      [...sold.values()].map((s) => s.menuItemId).filter(Boolean),
    ),
  ]
  const recipes = menuItemIds.length
    ? await db.menuItemRecipe.findMany({
        where: {
          menuItemId: { in: menuItemIds },
          menuItem: { businessProfileId: opts.businessProfileId },
        },
        select: { menuItemId: true, steps: true, stepsAr: true },
      })
    : []
  const stepsByMenu = new Map(
    recipes.map((r) => [r.menuItemId, { steps: r.steps, stepsAr: r.stepsAr }]),
  )

  const salesInPeriod = enrichSalesForWasteAi(
    [...sold.values()].map((s) => {
      const rec = s.menuItemId ? stepsByMenu.get(s.menuItemId) : null
      return {
        nameAr: s.nameAr,
        nameEn: s.nameEn,
        quantity: s.quantity,
        steps: rec?.steps ?? '',
        stepsAr: rec?.stepsAr ?? '',
      }
    }),
  )

  const lines = dayEndLinesForAi(opts.report.lines)

  const keyEnv = process.env.TRANSLATION_API_KEY?.trim()
  if (!keyEnv) throw new Error('TRANSLATION_API_KEY_MISSING')

  const preferred =
    process.env.GEMINI_TRANSLATION_MODEL?.trim() || 'gemini-2.0-flash'
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
  if ((res.status === 429 || res.status === 503) && preferred !== FALLBACK_MODEL) {
    ;({ res, json } = await generate(FALLBACK_MODEL))
  }
  if (!res.ok) {
    const msg =
      typeof json?.error?.message === 'string'
        ? json.error.message
        : `HTTP ${res.status}`
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

  return {
    aiAnalysis: `${en}\n<<<AR>>>\n${ar}`,
    aiAnalyzedAt: new Date(),
    lineEstimates,
  }
}
