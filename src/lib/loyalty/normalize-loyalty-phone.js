/**
 * Shared Saudi mobile normalization for Loyalty accounts.
 *
 * THIS IS THE ONLY place this logic may live. Every save path
 * (create/update LoyaltyAccount) and every lookup path (resolve by phone
 * at POS / admin) MUST import and call `normalizeLoyaltyPhone` — never
 * reimplement stripping, 966 handling, or 05/10-digit checks elsewhere.
 *
 * Output `normalized` (when valid) is digits-only, exactly 10 chars,
 * starting with "05" — the shape stored on `LoyaltyAccount.phone`.
 *
 * Carrier prefixes 050–059 are all accepted (STC / Mobily / Zain / Virgin /
 * Lebara). Only length and the "05" prefix are validated.
 *
 * @param {unknown} rawInput
 * @returns {{
 *   valid: true
 *   normalized: string
 * } | {
 *   valid: false
 *   reason: 'invalid_length' | 'invalid_prefix'
 *   error: string
 * }}
 *
 * @example
 * // Local with spaces/dashes
 * normalizeLoyaltyPhone('050 123 4567')     // { valid: true, normalized: '0501234567' }
 * normalizeLoyaltyPhone('050-123-4567')     // { valid: true, normalized: '0501234567' }
 *
 * // Country code with/without plus (international omits the leading 0)
 * normalizeLoyaltyPhone('+966501234567')    // { valid: true, normalized: '0501234567' }
 * normalizeLoyaltyPhone('966501234567')     // { valid: true, normalized: '0501234567' }
 * normalizeLoyaltyPhone('9660501234567')    // { valid: true, normalized: '0501234567' }
 *
 * // Invalid — too short
 * normalizeLoyaltyPhone('050123')           // { valid: false, reason: 'invalid_length', error: '…' }
 *
 * // Invalid — landline-shaped (01x), not mobile 05
 * normalizeLoyaltyPhone('0112345678')       // { valid: false, reason: 'invalid_prefix', error: '…' }
 */
export function normalizeLoyaltyPhone(rawInput) {
  const digits = String(rawInput ?? '').replace(/\D/g, '')

  let local = digits
  if (local.startsWith('966') && local.length > 10) {
    local = local.slice(3)
    // International form is 966 + 9 digits (5XXXXXXXX) without the trunk 0.
    if (local.length === 9 && local.startsWith('5')) {
      local = `0${local}`
    }
  }

  if (local.length !== 10) {
    return {
      valid: false,
      reason: 'invalid_length',
      error:
        'Enter a Saudi mobile number with exactly 10 digits (for example 0501234567)',
    }
  }

  if (!local.startsWith('05')) {
    return {
      valid: false,
      reason: 'invalid_prefix',
      error:
        'Saudi mobile numbers must start with 05 (for example 0501234567)',
    }
  }

  return { valid: true, normalized: local }
}
