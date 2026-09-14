import { getSessionUser } from '@/lib/auth/get-session-user'
import { jsonError, jsonOk } from '@/lib/api/json-response'
import { translateBilingualField } from '@/lib/translate/translate-to-arabic'
import { z } from 'zod'

const bodySchema = z.object({
  text: z.string().trim().min(1).max(8000),
  /** Optional; defaults to classic EN→AR for existing callers. */
  sourceLang: z.enum(['en', 'ar']).optional().default('en'),
  targetLang: z.enum(['en', 'ar']).optional().default('ar'),
})

export async function POST(request) {
  const session = await getSessionUser()
  if (!session) {
    return jsonError(401, 'UNAUTHORIZED', 'Not signed in')
  }

  let raw
  try {
    raw = await request.json()
  } catch {
    return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return jsonError(400, 'VALIDATION_ERROR', 'Invalid input')
  }

  const { text, sourceLang, targetLang } = parsed.data
  if (sourceLang === targetLang) {
    return jsonError(400, 'VALIDATION_ERROR', 'sourceLang and targetLang must differ')
  }

  try {
    const translated = await translateBilingualField(text, sourceLang, targetLang)
    if (targetLang === 'ar') {
      return jsonOk({ ar: translated, text: translated })
    }
    return jsonOk({ en: translated, text: translated })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'TRANSLATION_API_KEY_MISSING') {
      return jsonError(503, 'TRANSLATION_UNAVAILABLE', 'Translation is not configured')
    }
    console.error('[hisabi:translate-to-arabic]', msg)
    return jsonError(502, 'TRANSLATION_FAILED', 'Could not translate right now')
  }
}
