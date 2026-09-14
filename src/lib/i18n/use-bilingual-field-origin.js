import { useCallback, useRef, useState } from 'react'

/**
 * Whether the Gemini hook watching `fromLang` should run for this pair.
 * - Normal: form origin matches `fromLang` (origin → other).
 * - Gap-fill: origin is already set the other way, but the other field is empty —
 *   allow translating into that empty field without treating this as a new origin.
 *
 * @param {'en' | 'ar' | null} origin
 * @param {'en' | 'ar'} fromLang Language of the field the user is typing / being watched
 * @param {string} otherFieldValue Current value of the opposite field in the pair
 */
export function shouldEnableBilingualTranslate(origin, fromLang, otherFieldValue) {
  if (origin === fromLang) return true
  if (
    origin != null &&
    origin !== fromLang &&
    !String(otherFieldValue ?? '').trim()
  ) {
    return true
  }
  return false
}

/**
 * @typedef {{ pairKey: string, filledLang: 'en' | 'ar' }} AutoTranslatedPair
 */

/**
 * Form-level bilingual origin lock. Call once in the parent form and pass the
 * returned API into every bilingual field pair on that form.
 *
 * Also tracks which pairs were auto-filled this session (`autoTranslatedPairs`)
 * for the confirm modal: which pairs to show and which side is editable.
 */
export function useBilingualFieldOrigin() {
  const originRef = useRef(/** @type {'en' | 'ar' | null} */ (null))
  const [origin, setOrigin] = useState(/** @type {'en' | 'ar' | null} */ (null))
  /** @type {React.MutableRefObject<Record<string, 'en' | 'ar'>>} */
  const suppressByPairRef = useRef({})
  /** @type {React.MutableRefObject<Record<string, { lang: 'en' | 'ar', value: string }>>} */
  const autoFillSkipRef = useRef({})
  const [autoTranslatedPairs, setAutoTranslatedPairs] = useState(
    /** @type {AutoTranslatedPair[]} */ ([]),
  )

  /**
   * @param {'en' | 'ar'} lang
   * @param {string} [pairKey='_']
   * @param {{ otherFieldEmpty?: boolean }} [opts]
   * @returns {{ shouldTranslate: false } | { shouldTranslate: true, targetLang: 'en' | 'ar', gapFill?: boolean }}
   */
  const reportUserInput = useCallback((lang, pairKey = '_', opts = {}) => {
    if (suppressByPairRef.current[pairKey] === lang) {
      delete suppressByPairRef.current[pairKey]
      return { shouldTranslate: false }
    }

    const otherFieldEmpty = opts.otherFieldEmpty === true

    if (otherFieldEmpty && originRef.current !== null) {
      return {
        shouldTranslate: true,
        targetLang: lang === 'en' ? 'ar' : 'en',
        gapFill: true,
      }
    }

    if (originRef.current === null) {
      originRef.current = lang
      setOrigin(lang)
      return { shouldTranslate: true, targetLang: lang === 'en' ? 'ar' : 'en' }
    }

    if (originRef.current === lang) {
      return { shouldTranslate: true, targetLang: lang === 'en' ? 'ar' : 'en' }
    }

    return { shouldTranslate: false }
  }, [])

  /**
   * Call immediately before programmatically setting a field from a translation response.
   * Records the pair for the confirm modal (`filledLang` = language that was auto-written).
   *
   * @param {'en' | 'ar'} lang
   * @param {string} [pairKey='_']
   * @param {string} [value='']
   */
  const markAutoFilled = useCallback((lang, pairKey = '_', value = '') => {
    suppressByPairRef.current[pairKey] = lang
    autoFillSkipRef.current[pairKey] = {
      lang,
      value: String(value ?? '').trim(),
    }
    setAutoTranslatedPairs((prev) => {
      const rest = prev.filter((p) => p.pairKey !== pairKey)
      return [...rest, { pairKey, filledLang: lang }]
    })
  }, [])

  /**
   * @param {string} pairKey
   * @param {'en' | 'ar'} lang
   * @param {string} trimmedValue
   */
  const consumeAutoFillSkip = useCallback((pairKey, lang, trimmedValue) => {
    const skip = autoFillSkipRef.current[pairKey]
    if (
      skip &&
      skip.lang === lang &&
      skip.value === String(trimmedValue ?? '').trim()
    ) {
      delete autoFillSkipRef.current[pairKey]
      return true
    }
    return false
  }, [])

  const resetOrigin = useCallback(() => {
    originRef.current = null
    setOrigin(null)
    suppressByPairRef.current = {}
    autoFillSkipRef.current = {}
    setAutoTranslatedPairs([])
  }, [])

  return {
    origin,
    autoTranslatedPairs,
    reportUserInput,
    markAutoFilled,
    consumeAutoFillSkip,
    resetOrigin,
  }
}
