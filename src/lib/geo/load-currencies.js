import { unstable_cache } from 'next/cache'
import worldCountries from 'world-countries'

/**
 * Unique ISO 4217 currencies from world-countries (same source as /countries).
 * Cached for 24h.
 */
export const loadCurrencies = unstable_cache(
  async () => {
    /** @type {Map<string, { code: string, name: string, symbol: string | null }>} */
    const byCode = new Map()

    for (const country of worldCountries) {
      if (!country.currencies || typeof country.currencies !== 'object') continue
      for (const [code, info] of Object.entries(country.currencies)) {
        const upper = String(code).trim().toUpperCase()
        if (!upper || byCode.has(upper)) continue
        byCode.set(upper, {
          code: upper,
          name:
            typeof info?.name === 'string' && info.name.trim()
              ? info.name.trim()
              : upper,
          symbol:
            typeof info?.symbol === 'string' && info.symbol.trim()
              ? info.symbol.trim()
              : null,
        })
      }
    }

    const list = [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code, 'en'))
    const sarIdx = list.findIndex((c) => c.code === 'SAR')
    if (sarIdx > 0) {
      const [sar] = list.splice(sarIdx, 1)
      list.unshift(sar)
    }
    return list
  },
  ['hisabi-pos-currencies-world-v1'],
  { revalidate: 86_400 },
)
