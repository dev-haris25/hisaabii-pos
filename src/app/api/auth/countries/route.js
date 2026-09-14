import { unstable_cache } from 'next/cache'
import worldCountries from 'world-countries'

import { jsonError, jsonOk } from '@/lib/api/json-response'
import { getSessionUser } from '@/lib/auth/get-session-user'
import { flagCdnPngUrl } from '@/lib/geo/flag-cdn-url'
import { flagEmojiFromAlpha2 } from '@/lib/geo/flag-emoji'
import { loadCurrencies } from '@/lib/geo/load-currencies'

/**
 * @param {typeof worldCountries[number]} c
 * @returns {{ code: string, name: string, dial: string | null, flag: string, flagUrl: string | null } | null}
 */
function normalizeWorldCountry(c) {
  const code = c.cca2
  if (!code || typeof code !== 'string' || code.length !== 2) return null
  const upper = code.toUpperCase()
  const name =
    typeof c.name?.common === 'string' && c.name.common.trim()
      ? c.name.common.trim()
      : upper
  let dial = null
  const root = c.idd?.root
  const suffixes = c.idd?.suffixes
  if (typeof root === 'string' && root.startsWith('+')) {
    const rootDigits = root.replace(/\D/g, '')
    if (suffixes && Array.isArray(suffixes) && suffixes.length > 0) {
      const first = String(suffixes[0] ?? '').replace(/\D/g, '')
      const combined = `${rootDigits}${first}`
      if (combined) dial = `+${combined}`
    } else if (rootDigits) {
      dial = `+${rootDigits}`
    }
  }
  const emoji =
    typeof c.flag === 'string' && c.flag.trim() ? c.flag.trim() : flagEmojiFromAlpha2(upper)
  return {
    code: upper,
    name,
    dial,
    flag: emoji,
    flagUrl: flagCdnPngUrl(upper) || null,
  }
}

const loadCountries = unstable_cache(
  async () => {
    /** @type {Array<{ code: string, name: string, dial: string | null, flag: string, flagUrl: string | null }>} */
    const out = []
    for (const c of worldCountries) {
      const row = normalizeWorldCountry(c)
      if (row) out.push(row)
    }
    out.sort((a, b) => a.name.localeCompare(b.name, 'en'))
    return out
  },
  ['hisabi-pos-countries-world-v1'],
  { revalidate: 86_400 },
)

export async function GET() {
  const session = await getSessionUser()
  if (!session) {
    return jsonError(401, 'UNAUTHORIZED', 'Not signed in')
  }

  try {
    const [countries, currencies] = await Promise.all([loadCountries(), loadCurrencies()])
    return jsonOk({ countries, currencies })
  } catch (err) {
    console.error('[hisabi-pos:countries] load failed', err)
    return jsonError(502, 'UPSTREAM_ERROR', 'Could not load country list')
  }
}
