/**
 * Gemini/Gemma-assisted bilingual translation for invoice-facing copy. Server-only.
 * Supports en→ar and ar→en. `translateToArabic` remains a thin EN→AR wrapper.
 *
 * Uses JSON response schema so instruction-following models (e.g. Gemma) cannot
 * return chain-of-thought that our line extractors might mistake for the answer.
 */

import { extractArabicInvoiceLine } from '@/lib/translate/translate-to-arabic-extract'

const FALLBACK_MODEL = 'gemini-2.5-flash'

/**
 * Reject Gemma-style instruction echoes / glosses / reasoning lines.
 * @param {string} line
 */
function isMetaEnglishLine(line) {
  const s = line.trim()
  if (!s) return true
  if (
    /^(constraints?|constraint\s*\d*|input|output|context|task|source|target|option\s*\d*|final\s*answer)\b/i.test(
      s,
    )
  ) {
    return true
  }
  if (
    /\b(exactly one line|english only|no labels|no markdown|no quotes|no explanations|no preamble|constraints?\s+restated)\b/i.test(
      s,
    )
  ) {
    return true
  }
  // Dictionary glosses: "شركة (Sharikat) = Company"
  if (/\s=\s/.test(s)) return true
  if (/\bis the standard\b/i.test(s)) return true
  if (/^(one line|english only|no arabic)\b.*\?$/i.test(s)) return true
  return false
}

/**
 * When the model ignores instructions and returns bullets / reasoning,
 * take the best contiguous English phrase so the UI field stays clean.
 *
 * @param {string} raw
 * @returns {string}
 */
export function extractEnglishInvoiceLine(raw) {
  const s = raw.trim()
  if (!s) return s

  const lines = s
    .split(/\n/)
    .map((line) =>
      line
        .replace(/^[\s*•\-]+/, '')
        .replace(/^["'`]+|["'`]+$/g, '')
        .trim(),
    )
    .filter(Boolean)

  const candidates = lines.filter(
    (line) =>
      /[A-Za-z]/.test(line) &&
      !/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(
        line,
      ) &&
      !isMetaEnglishLine(line) &&
      line.length <= 200,
  )

  if (candidates.length === 1) {
    return candidates[0].replace(/\s+/g, ' ').trim()
  }

  if (candidates.length > 1) {
    // Prefer short business-name lines (titles) over long sentences.
    const ranked = [...candidates].sort((a, b) => {
      const aWords = a.split(/\s+/).length
      const bWords = b.split(/\s+/).length
      const aScore = aWords <= 8 ? aWords : 100 + a.length
      const bScore = bWords <= 8 ? bWords : 100 + b.length
      return aScore - bScore || a.length - b.length
    })
    return ranked[0].replace(/\s+/g, ' ').trim()
  }

  if (!/[*•]|```|\bOption\s+\d+\b/i.test(s) && !/\n/.test(s)) {
    const cleaned = s.replace(/\s+/g, ' ').trim()
    if (cleaned && /[A-Za-z]/.test(cleaned) && !isMetaEnglishLine(cleaned)) {
      return cleaned
    }
  }

  const chunks =
    s.match(/[A-Za-z][A-Za-z0-9'’.,;:!?\-/\s]*[A-Za-z0-9.!?]/g) ?? []
  const filtered = chunks.filter((c) => !isMetaEnglishLine(c.trim()))
  const pool = filtered.length ? filtered : chunks
  if (!pool.length) {
    return s.replace(/\s+/g, ' ').trim()
  }
  pool.sort((a, b) => {
    const aWords = a.trim().split(/\s+/).length
    const bWords = b.trim().split(/\s+/).length
    // Prefer short title-like phrases over long instruction echoes
    if (aWords <= 8 && bWords > 8) return -1
    if (bWords <= 8 && aWords > 8) return 1
    return a.length - b.length
  })
  return pool[0].replace(/\s+/g, ' ').trim()
}

/**
 * @param {string} raw
 * @param {'en' | 'ar'} targetLang
 * @returns {string | null}
 */
function parseJsonTranslation(raw, targetLang) {
  const key = targetLang === 'ar' ? 'ar' : 'en'
  let s = raw.trim()
  if (!s) return null
  // Gemma sometimes wraps JSON in markdown fences
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]) s = fence[1].trim()
  // Leading junk before `{`
  const brace = s.indexOf('{')
  if (brace > 0) s = s.slice(brace)
  const end = s.lastIndexOf('}')
  if (end >= 0) s = s.slice(0, end + 1)
  try {
    const obj = JSON.parse(s)
    const val = obj?.[key]
    if (typeof val === 'string' && val.trim()) return val.trim()
  } catch {
    // fall through
  }
  return null
}

/**
 * @param {string} text
 * @param {'en' | 'ar'} sourceLang
 * @param {'en' | 'ar'} targetLang
 * @returns {Promise<string>}
 */
export async function translateBilingualField(text, sourceLang, targetLang) {
  const trimmed = text.trim()
  if (!trimmed) return ''

  if (sourceLang === targetLang) {
    return trimmed
  }

  const key = process.env.TRANSLATION_API_KEY?.trim()
  if (!key) {
    throw new Error('TRANSLATION_API_KEY_MISSING')
  }

  const preferred =
    process.env.GEMINI_TRANSLATION_MODEL?.trim() || 'gemini-2.0-flash'

  const toArabic = targetLang === 'ar'
  const sourceLabel = sourceLang === 'ar' ? 'Arabic' : 'English'
  const resultKey = toArabic ? 'ar' : 'en'
  const isLongForm = trimmed.length > 200 || /\n/.test(trimmed)

  const systemText = isLongForm
    ? toArabic
      ? [
          'You are a translation micro-service for Hisabi POS kitchen recipes.',
          'Convert the English cooking method / steps into clear Modern Standard Arabic for kitchen staff.',
          'Keep the same structure, numbering, and line breaks. Preserve units and temperatures.',
          `Return JSON only: {"${resultKey}":"<arabic translation>"}.`,
          'The value must be Arabic script (plus Arabic punctuation and digits). No English glosses, markdown, or explanations.',
        ].join(' ')
      : [
          'You are a translation micro-service for Hisabi POS kitchen recipes.',
          'Convert the Arabic cooking method / steps into clear kitchen English.',
          'Keep the same structure, numbering, and line breaks. Preserve units and temperatures.',
          `Return JSON only: {"${resultKey}":"<english translation>"}.`,
          'The value must be English only. No Arabic, markdown, reasoning, or restated constraints.',
        ].join(' ')
    : toArabic
      ? [
          'You are a translation micro-service for Saudi VAT e-invoices.',
          'Convert the English field value into Modern Standard Arabic suitable for invoice printing.',
          `Return JSON only: {"${resultKey}":"<arabic translation>"}.`,
          'The value must be Arabic script only (plus Arabic punctuation). No English, markdown, or explanations.',
        ].join(' ')
      : [
          'You are a translation micro-service for Saudi VAT e-invoices.',
          'Convert the Arabic field value into clear business English suitable for invoice printing.',
          `Return JSON only: {"${resultKey}":"<english translation>"}.`,
          'The value must be English only. No Arabic, markdown, reasoning, or restated constraints.',
        ].join(' ')

  const userText = isLongForm
    ? [
        `Translate the following ${sourceLabel} kitchen recipe steps.`,
        `Return JSON with key "${resultKey}" only.`,
        `${sourceLabel}:`,
        trimmed,
      ].join('\n')
    : [
        `Translate the following ${sourceLabel} for a Saudi VAT invoice.`,
        `Return JSON with key "${resultKey}" only.`,
        `${sourceLabel}:`,
        trimmed,
      ].join('\n')

  const body = {
    systemInstruction: {
      parts: [{ text: systemText }],
    },
    contents: [
      {
        parts: [{ text: userText }],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: isLongForm ? 4096 : 256,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          [resultKey]: { type: 'STRING' },
        },
        required: [resultKey],
      },
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
    return { res, json, model }
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

  const out = json.candidates?.[0]?.content?.parts?.[0]?.text
  if (typeof out !== 'string' || !out.trim()) {
    throw new Error('EMPTY_TRANSLATION')
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('[hisabi:translate]', {
      sourceLang,
      targetLang,
      inputPreview: trimmed.slice(0, 80),
      rawPreview: out.slice(0, 240),
    })
  }

  const fromJson = parseJsonTranslation(out, targetLang)
  const cleaned = isLongForm
    ? fromJson || out.trim()
    : fromJson
      ? toArabic
        ? extractArabicInvoiceLine(fromJson)
        : extractEnglishInvoiceLine(fromJson)
      : toArabic
        ? extractArabicInvoiceLine(out)
        : extractEnglishInvoiceLine(out)

  if (!cleaned) {
    throw new Error('EMPTY_TRANSLATION')
  }

  // Final guard: never accept instruction-echo English as a translation
  if (!toArabic && isMetaEnglishLine(cleaned)) {
    throw new Error('EMPTY_TRANSLATION')
  }

  return cleaned
}

/**
 * @param {string} text
 * @returns {Promise<string>}
 */
export async function translateToArabic(text) {
  return translateBilingualField(text, 'en', 'ar')
}
