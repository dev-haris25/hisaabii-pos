import { jsonError } from '@/lib/api/json-response'

/**
 * Map unexpected route errors to a safe JSON 500 (logs full detail server-side).
 * @param {unknown} err
 * @param {string} context e.g. "POST /api/auth/login"
 */
export function handleRouteError(err, context) {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`[api] ${context}:`, err)

  const code =
    err && typeof err === 'object' && 'code' in err ? String(err.code) : ''

  // Coupon-linked variant options use onDelete: Restrict — surface that clearly.
  if (code === 'P2003') {
    const metaBlob = JSON.stringify(
      err && typeof err === 'object' && 'meta' in err ? err.meta : {},
    )
    if (
      /coupon_item_rule_variant_options/i.test(message) ||
      /coupon_item_rule_variant_options/i.test(metaBlob) ||
      /RestrictViolation/i.test(metaBlob)
    ) {
      return jsonError(
        409,
        'VARIANT_OPTION_IN_USE',
        'This variant option is used by a coupon and cannot be removed or replaced right now',
      )
    }
  }

  // Prisma / DB first — bundled error messages can contain unrelated source text.
  if (
    code.startsWith('P') ||
    message.includes('connect') ||
    message.includes('ECONNREFUSED') ||
    message.includes('ENOTFOUND') ||
    message.includes('password authentication failed') ||
    message.includes('TLS') ||
    message.includes('certificate')
  ) {
    return jsonError(500, 'DATABASE_ERROR', 'Database connection failed')
  }

  if (message === 'AUTH_SECRET is required in production') {
    return jsonError(
      500,
      'SERVER_MISCONFIGURED',
      'Server auth is not configured (AUTH_SECRET)',
    )
  }
  if (message === 'DATABASE_URL is required in production') {
    return jsonError(
      500,
      'SERVER_MISCONFIGURED',
      'Server database is not configured (DATABASE_URL)',
    )
  }

  if (
    message.includes('ZATCA') ||
    message.includes('compliance check failed') ||
    message.includes('CSID') ||
    message.includes('submission rejected') ||
    message.includes('certificate matches') ||
    message.includes('does not match the supplied CSID') ||
    // Compliance CSID / OTP failures often omit the word "ZATCA" (e.g.
    // "The provided OTP is invalid" / "[Invalid-OTP] …").
    /\bInvalid-OTP\b/i.test(message) ||
    /\bOTP\b/i.test(message) ||
    /one[-\s]?time\s*password/i.test(message) ||
    /compliance.?request/i.test(message) ||
    /dispositionMessage/i.test(message)
  ) {
    return jsonError(502, 'ZATCA_ERROR', message.slice(0, 900))
  }

  if (message.includes('Complete ZATCA onboarding')) {
    return jsonError(400, 'ZATCA_NOT_ONBOARDED', message.slice(0, 500))
  }

  if (code === 'SELLER_PROFILE_INCOMPLETE') {
    return jsonError(400, code, message.slice(0, 500))
  }

  return jsonError(500, 'SERVER_ERROR', 'Something went wrong')
}
