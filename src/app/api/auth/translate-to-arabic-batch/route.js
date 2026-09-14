import { getSessionUser } from '@/lib/auth/get-session-user'
import { jsonError, jsonOk } from '@/lib/api/json-response'
import { translateFieldsBatch } from '@/lib/translate/translate-fields-to-arabic'
import { z } from 'zod'

const bodySchema = z.object({
  fields: z.record(z.string(), z.string().max(2000)).refine(
    (obj) => Object.keys(obj).length > 0 && Object.keys(obj).length <= 40,
    'Invalid field count',
  ),
  direction: z.enum(['en-to-ar', 'ar-to-en']).optional().default('en-to-ar'),
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

  const { fields, direction } = parsed.data

  try {
    const translated = await translateFieldsBatch(fields, direction)
    if (direction === 'ar-to-en') {
      return jsonOk({ en: translated })
    }
    return jsonOk({ ar: translated })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'TRANSLATION_API_KEY_MISSING') {
      return jsonError(503, 'TRANSLATION_UNAVAILABLE', 'Translation is not configured')
    }
    console.error('[hisabi:translate-to-arabic-batch]', msg)
    return jsonError(502, 'TRANSLATION_FAILED', 'Could not translate right now')
  }
}
