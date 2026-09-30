/** Ambiguous 0/O, 1/I/L excluded — keep in sync with allocate-unique-coupon-code.js */
export const COUPON_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export const COUPON_CODE_LENGTH = 8

/**
 * Browser-safe preview / autofill for shared coupon codes (same alphabet + length as server).
 * @returns {string}
 */
export function generateCouponCodeStringClient() {
  const bytes = new Uint32Array(COUPON_CODE_LENGTH)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < COUPON_CODE_LENGTH; i++) {
    out += COUPON_CODE_ALPHABET[bytes[i] % COUPON_CODE_ALPHABET.length]
  }
  return out
}
