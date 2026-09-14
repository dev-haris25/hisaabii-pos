import { extractArabicInvoiceLine } from '@/lib/translate/translate-to-arabic-extract'
import { extractEnglishInvoiceLine } from '@/lib/translate/translate-to-arabic'

const FALLBACK_MODEL = 'gemini-2.5-flash'

const BATCH_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {},
  required: [],
}

/**
 * @typedef {'en-to-ar' | 'ar-to-en'} BatchTranslateDirection
 */

/**
 * Batch-translate labeled fields for Saudi VAT invoice copy.
 *
 * @param {Record<string, string>} fields
 * @param {BatchTranslateDirection} [direction='en-to-ar']
 * @returns {Promise<Record<string, string>>}
 */
export async function translateFieldsBatch(fields, direction = 'en-to-ar') {
  const entries = Object.entries(fields).filter(([, v]) => String(v ?? '').trim())
  if (entries.length === 0) return {}

  const key = process.env.TRANSLATION_API_KEY?.trim()
  if (!key) {
    throw new Error('TRANSLATION_API_KEY_MISSING')
  }

  const preferred =
    process.env.GEMINI_TRANSLATION_MODEL?.trim() || 'gemini-2.0-flash'

  const toArabic = direction === 'en-to-ar'

  /** @type {Record<string, { type: string }>} */
  const properties = {}
  for (const [fieldKey] of entries) {
    properties[fieldKey] = { type: 'STRING' }
  }

  const schema = {
    ...BATCH_RESPONSE_SCHEMA,
    properties,
    required: entries.map(([k]) => k),
  }

  const inputLines = entries.map(([k, v]) => `${k}: ${String(v).trim()}`).join('\n')

  const systemText = toArabic
    ? [
        'You are a strict translation micro-service for Saudi VAT e-invoices.',
        'Translate each English field value into Modern Standard Arabic suitable for printing on an invoice.',
        'Return JSON only with the same keys as the input.',
        'Each value must be Arabic script only (plus Arabic punctuation). No English, markdown, or explanations.',
        'If a value is already Arabic, return it cleaned (same meaning, one line).',
      ].join(' ')
    : [
        'You are a strict translation micro-service for Saudi VAT e-invoices.',
        'Translate each Arabic field value into clear business English suitable for printing on an invoice.',
        'Return JSON only with the same keys as the input.',
        'Each value must be English only. No Arabic, markdown, reasoning, or explanations.',
        'If a value is already English, return it cleaned (same meaning, one line).',
      ].join(' ')

  const userLead = toArabic
    ? [
        'Translate these labeled English fields for a Saudi VAT invoice.',
        'Return JSON with the same keys and Arabic values only.',
      ]
    : [
        'Translate these labeled Arabic fields for a Saudi VAT invoice.',
        'Return JSON with the same keys and English values only.',
      ]

  const body = {
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [
      {
        parts: [
          {
            text: [...userLead, '', inputLines].join('\n'),
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.15,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  }

  /**
   * @param {string} model
   */
  async function generate(model) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    return { res, json }
  }

  let { res, json } = await generate(preferred)
  if (res.status === 429 && preferred !== FALLBACK_MODEL) {
    ;({ res, json } = await generate(FALLBACK_MODEL))
  }

  if (!res.ok) {
    const msg =
      typeof json?.error?.message === 'string'
        ? json.error.message
        : `HTTP ${res.status}`
    throw new Error(msg)
  }

  const text = json.candidates?.[0]?.content?.parts?.[0]?.text
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('EMPTY_TRANSLATION')
  }

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('INVALID_TRANSLATION_JSON')
  }

  /** @type {Record<string, string>} */
  const result = {}
  for (const [fieldKey] of entries) {
    const raw = parsed[fieldKey]
    if (typeof raw !== 'string') continue
    const cleaned = toArabic
      ? extractArabicInvoiceLine(raw)
      : extractEnglishInvoiceLine(raw)
    if (cleaned) result[fieldKey] = cleaned
  }

  if (Object.keys(result).length === 0) {
    throw new Error('EMPTY_TRANSLATION')
  }

  return result
}

/**
 * @param {Record<string, string>} fields
 * @returns {Promise<Record<string, string>>}
 */
export async function translateFieldsToArabic(fields) {
  return translateFieldsBatch(fields, 'en-to-ar')
}
