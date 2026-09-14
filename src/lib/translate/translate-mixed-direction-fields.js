import { authPost } from '@/lib/api/auth-client'

/**
 * @typedef {{ key: string, en?: string | null, ar?: string | null }} BilingualFieldPair
 */

/**
 * Split bilingual pairs into independent translation groups.
 * Each pair is judged on its own values — mixed documents are supported.
 *
 * @param {BilingualFieldPair[]} fieldPairs
 * @returns {{ needsEnToAr: Record<string, string>, needsArToEn: Record<string, string> }}
 */
export function groupFieldsByTranslationDirection(fieldPairs) {
  /** @type {Record<string, string>} */
  const needsEnToAr = {}
  /** @type {Record<string, string>} */
  const needsArToEn = {}

  for (const pair of fieldPairs) {
    const en = String(pair.en ?? '').trim()
    const ar = String(pair.ar ?? '').trim()
    const enFilled = Boolean(en)
    const arFilled = Boolean(ar)

    if (enFilled && !arFilled) {
      needsEnToAr[pair.key] = en
    } else if (arFilled && !enFilled) {
      needsArToEn[pair.key] = ar
    }
    // both filled, or both empty → no translation needed
  }

  return { needsEnToAr, needsArToEn }
}

/**
 * Fire EN→AR and AR→EN batch calls in parallel when each group has fields.
 *
 * @param {BilingualFieldPair[]} fieldPairs
 * @returns {Promise<{ ar: Record<string, string>, en: Record<string, string> }>}
 */
export async function translateMixedDirectionFields(fieldPairs) {
  const { needsEnToAr, needsArToEn } = groupFieldsByTranslationDirection(fieldPairs)

  const [enToArResult, arToEnResult] = await Promise.all([
    Object.keys(needsEnToAr).length > 0
      ? authPost('/translate-to-arabic-batch', {
          fields: needsEnToAr,
          direction: 'en-to-ar',
        })
      : Promise.resolve(null),
    Object.keys(needsArToEn).length > 0
      ? authPost('/translate-to-arabic-batch', {
          fields: needsArToEn,
          direction: 'ar-to-en',
        })
      : Promise.resolve(null),
  ])

  return {
    ar: /** @type {Record<string, string>} */ (enToArResult?.ar ?? {}),
    en: /** @type {Record<string, string>} */ (arToEnResult?.en ?? {}),
  }
}
