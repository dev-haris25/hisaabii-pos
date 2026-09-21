import { formatQtyString, parseQty } from './units.js'

const FALLBACK_MODEL = 'gemini-2.5-flash'
const MAX_OUTPUT_TOKENS = 2048
const RETRY_BACKOFF_MS = 600
const HISTORY_BATCH_LIMIT = 8

const WASTE_SEVERITIES = new Set(['low', 'bearable', 'high'])

/**
 * @param {string} raw
 * @returns {Record<string, unknown> | null}
 */
function parseJsonObject(raw) {
  let s = raw.trim()
  if (!s) return null
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]) s = fence[1].trim()
  const brace = s.indexOf('{')
  if (brace > 0) s = s.slice(brace)
  const end = s.lastIndexOf('}')
  if (end >= 0) s = s.slice(0, end + 1)
  try {
    const obj = JSON.parse(s)
    return obj && typeof obj === 'object' ? obj : null
  } catch {
    return null
  }
}

/**
 * @param {number} n
 */
function roundQty(n) {
  return Math.round(n * 1000) / 1000
}

/**
 * @param {number} n
 */
function roundPct(n) {
  return Math.round(n * 10) / 10
}

/**
 * @param {{
 *   isBulk: boolean
 *   issued: number
 *   recipeUsed: number
 *   inferredBulkUse: number
 *   unitCost?: number | null
 * }} input
 */
export function computeKitchenWasteTotals(input) {
  const issued = Math.max(0, input.issued)
  const recipeUsed = Math.max(0, input.recipeUsed)
  const room = Math.max(0, issued - recipeUsed)
  let inferred = Number.isFinite(input.inferredBulkUse)
    ? input.inferredBulkUse
    : 0
  if (inferred < 0) inferred = 0
  const clamped = inferred > room
  if (!input.isBulk) inferred = 0
  else if (inferred > room) inferred = room

  const estimatedUsed = input.isBulk
    ? roundQty(recipeUsed + inferred)
    : roundQty(recipeUsed)
  const waste = input.isBulk
    ? roundQty(Math.max(0, issued - estimatedUsed))
    : roundQty(Math.max(0, issued - recipeUsed))
  const wastePct = issued > 0 ? roundPct((waste / issued) * 100) : 0
  const unitCost =
    input.unitCost != null && Number.isFinite(input.unitCost)
      ? input.unitCost
      : null
  const wasteCost =
    unitCost != null ? Math.round(waste * unitCost * 100) / 100 : null

  return {
    inferredBulkUse: roundQty(inferred),
    estimatedUsed,
    estimatedWaste: waste,
    waste,
    wastePct,
    wasteCost,
    clamped,
  }
}

/**
 * Sales rows for the model: names, counts, and owner recipe steps (EN + AR) when present.
 * @param {Array<Record<string, unknown>>} sales
 */
export function enrichSalesForWasteAi(sales) {
  return (sales ?? []).map((s) => {
    const en = typeof s.steps === 'string' ? s.steps.trim() : ''
    const ar = typeof s.stepsAr === 'string' ? s.stepsAr.trim() : ''
    return {
      nameAr: s.nameAr ?? null,
      nameEn: s.nameEn ?? null,
      quantity: Number(s.quantity ?? s.portionsSold ?? 0) || 0,
      recipeSteps: en || null,
      recipeStepsAr: ar || null,
    }
  })
}

function promptBlocks(unit) {
  return [
    [
      'ROLE',
      'You are a kitchen-stock wastage analyst for Hisabi POS (restaurants, Saudi/UAE/Pakistan context). You are given data for one CLOSED stock batch.',
    ],
    [
      'SCOPE',
      '- Your only concern is WASTE: how much of the issued quantity was not used, and whether that is a problem.',
      '- Do not recommend issuing more or less stock, changing allocation, or comment on sales volume being high or low.',
      '- Never contradict the computed waste numbers when explaining.',
    ],
    [
      'INPUT',
      'JSON with: batch (issued, recipeUsed, unit, times), item (name, isBulk), salesInPeriod (dish names, quantities, and recipeSteps / recipeStepsAr written by the restaurant), history if present. Judge from the data, the recipe steps, and kitchen practice.',
    ],
    [
      `BULK ITEMS (only when isBulk = true; unit ${unit})`,
      '- Shared kitchen use (bath, pot, etc.). recipeUsed is only what recipes listed for this item.',
      '- Estimate additional process use from the dishes sold (your own judgement — any menu, any bulk item).',
      `- Return inferredBulkUse in ${unit} (>= 0). Do not set it equal to leftover or pad it to issued.`,
      '- List assumptions in "assumptions".',
    ],
    [
      'NON-BULK ITEMS',
      '- inferredBulkUse must be 0. Waste is ledger waste as provided.',
    ],
    [
      'EXPLANATION (analysisEn and analysisAr)',
      '- Write for a restaurant owner, not an accountant. Full sentences. No bullet lists of raw stats.',
      '- Start by walking through EACH number in plain words, in this order, using computed values and the unit:',
      '  1) How much was issued into this kitchen box.',
      '  2) How much was used in recipes (measured pours / ingredients). If recipe used is 0, say nothing was taken by recipes.',
      '  3) For bulk only: how much extra you estimated as process use. Skip this sentence for non-bulk.',
      '  4) How much was used in total.',
      '  5) How much was wasted when the box was closed (unused leftover is waste), and what percent of issued that is.',
      '  6) Say whether that waste is low, bearable, or high in everyday words (e.g. "most of this box was unused" or "waste is small").',
      '- Example tone: "The kitchen was given 8 litres of fryer oil. Recipes used 0.28 litres (karahi and similar measured pours). Frying fries and broast absorbed about 0.53 litres. Altogether 0.81 litres were used. When this box was closed, 7.19 litres were still unused, so that is waste — about 90% of what was issued. That is high."',
      '- Then 1–2 short sentences on the likely reason. Unused leftover at close is unused stock, not extra fryer use. Do not blame fries/broast for oil that was never used.',
      '- If severity is high, suggest checking unused leftover at close, spoilage, or over-prep. If low, say waste looks normal.',
      '- Do not invent data. Arabic must be natural MSA and use the same numbers as English.',
    ],
    ['OUTPUT', 'JSON only, matching the schema. No markdown.'],
  ]
    .map(([title, ...lines]) => `${title}\n${lines.join('\n')}`)
    .join('\n\n')
}

function estimateSchema() {
  return {
    type: 'OBJECT',
    properties: {
      inferredBulkUse: { type: 'NUMBER' },
      assumptions: { type: 'STRING' },
    },
    required: ['inferredBulkUse', 'assumptions'],
  }
}

function explainSchema() {
  return {
    type: 'OBJECT',
    properties: {
      analysisEn: { type: 'STRING' },
      analysisAr: { type: 'STRING' },
      wasteSeverity: { type: 'STRING', enum: ['low', 'bearable', 'high'] },
    },
    required: ['analysisEn', 'analysisAr', 'wasteSeverity'],
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function finiteNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const n = Number.parseFloat(value.trim())
    if (Number.isFinite(n)) return n
  }
  return null
}

/**
 * Ask Gemini to estimate bulk absorption only, then write the explanation.
 * Waste, %, and severity are computed in code.
 * Approach: two calls for bulk (estimate then explain with injected numbers);
 * one explanation call for non-bulk.
 *
 * @param {Record<string, unknown>} payload
 * @returns {Promise<{
 *   wasteSeverity: string
 *   aiAnalysis: string
 *   aiQuantityUsed: string | null
 *   quantityWaste: string | null
 *   wastePct: number
 *   assumptions: string | null
 *   clamped: boolean
 * }>}
 */
export async function analyzeKitchenWasteWithGemini(payload) {
  const key = process.env.TRANSLATION_API_KEY?.trim()
  if (!key) {
    throw new Error('TRANSLATION_API_KEY_MISSING')
  }

  const preferred =
    process.env.GEMINI_TRANSLATION_MODEL?.trim() || 'gemini-2.0-flash'
  const isBulk = payload.isBulk === true
  const unit = String(payload.unit ?? payload.batch?.unit ?? '')
  const issued =
    parseQty(payload.issued ?? payload.batch?.issuedQty ?? '0') ?? 0
  const recipeUsed =
    parseQty(payload.recipeUsed ?? payload.batch?.recipeUsedQty ?? '0') ?? 0
  const unitCost = parseQty(
    payload.batch?.unitCost ?? payload.stockItem?.unitCost ?? '',
  )

  const systemText = promptBlocks(unit)

  /**
   * @param {string} model
   * @param {unknown} schema
   * @param {string} userText
   */
  async function generateOnce(model, schema, userText) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`
    const body = {
      systemInstruction: { parts: [{ text: systemText }] },
      contents: [{ parts: [{ text: userText }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    return { res, json }
  }

  /**
   * @param {unknown} schema
   * @param {string} userText
   */
  async function generate(schema, userText) {
    let { res, json } = await generateOnce(preferred, schema, userText)
    if ((res.status === 429 || res.status === 503) && preferred !== FALLBACK_MODEL) {
      await sleep(RETRY_BACKOFF_MS)
      ;({ res, json } = await generateOnce(preferred, schema, userText))
    }
    if (
      (res.status === 429 || res.status === 503) &&
      preferred !== FALLBACK_MODEL
    ) {
      ;({ res, json } = await generateOnce(FALLBACK_MODEL, schema, userText))
    }
    if (!res.ok) {
      const msg =
        typeof json?.error?.message === 'string'
          ? json.error.message
          : `HTTP ${res.status}`
      throw new Error(msg)
    }
    const out = json.candidates?.[0]?.content?.parts?.[0]?.text
    if (typeof out !== 'string' || !out.trim()) {
      throw new Error('EMPTY_WASTE_ANALYSIS')
    }
    const parsed = parseJsonObject(out)
    if (!parsed) throw new Error('EMPTY_WASTE_ANALYSIS')
    return parsed
  }

  let inferredBulkUse = 0
  let assumptions = ''
  if (isBulk) {
    const estimated = await generate(
      estimateSchema(),
      JSON.stringify({
        task: 'estimate_inferredBulkUse_only',
        ...payload,
      }),
    )
    const n = finiteNumber(estimated.inferredBulkUse)
    if (n == null) throw new Error('EMPTY_WASTE_ANALYSIS')
    inferredBulkUse = n
    assumptions =
      typeof estimated.assumptions === 'string'
        ? estimated.assumptions.trim()
        : ''
  }

  const totals = computeKitchenWasteTotals({
    isBulk,
    issued,
    recipeUsed,
    inferredBulkUse,
    unitCost,
  })

  const explained = await generate(
    explainSchema(),
    JSON.stringify({
      task: 'explain_computed_wastage_only',
      ...payload,
      computed: {
        issued,
        recipeUsed,
        inferredBulkUse: totals.inferredBulkUse,
        estimatedUsed: totals.estimatedUsed,
        estimatedWaste: totals.waste,
        wastePct: totals.wastePct,
        wasteSeverity: totals.wasteSeverity,
        wasteCost: totals.wasteCost,
        unit,
        assumptions,
        clamped: totals.clamped,
        explainInOrder: [
          `issued ${issued} ${unit}`,
          `recipe used ${recipeUsed} ${unit}`,
          isBulk ? `process use ${totals.inferredBulkUse} ${unit}` : null,
          `total used ${totals.estimatedUsed} ${unit}`,
          `waste ${totals.waste} ${unit} (${totals.wastePct}% of issued)`,
        ].filter(Boolean),
        writeLikeOwner:
          'Turn each of explainInOrder into a short readable sentence. Do not output a compact stats line.',
      },
    }),
  )
  const en =
    typeof explained.analysisEn === 'string' ? explained.analysisEn.trim() : ''
  const ar =
    typeof explained.analysisAr === 'string' ? explained.analysisAr.trim() : ''
  if (!en || !ar) throw new Error('EMPTY_WASTE_ANALYSIS')
  const wasteSeverity =
    typeof explained.wasteSeverity === 'string' &&
    WASTE_SEVERITIES.has(explained.wasteSeverity)
      ? explained.wasteSeverity
      : 'bearable'

  return {
    wasteSeverity,
    aiAnalysis: `${en}\n\n${ar}`,
    aiQuantityUsed: isBulk ? formatQtyString(totals.estimatedUsed) : null,
    quantityWaste: isBulk ? formatQtyString(totals.waste) : null,
    wastePct: totals.wastePct,
    assumptions: assumptions || null,
    clamped: totals.clamped,
  }
}

export { HISTORY_BATCH_LIMIT }
