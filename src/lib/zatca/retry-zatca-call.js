import { ZatcaErrorCode } from '@talha7k/zatca'

/** HTTP statuses ZATCA's own guidance says to just resend ("action failed, invoice not received"). */
const TRANSIENT_HTTP_STATUSES = new Set([429, 500, 502, 503, 504])

/** Network-level failures thrown by the library's HTTP client (never a real rejection). */
const TRANSIENT_ERROR_CODES = new Set([
  ZatcaErrorCode.API_TIMEOUT,
  ZatcaErrorCode.API_CONNECTION_ERROR,
])

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Retries a ZATCA API call — but ONLY on transient failures:
 *   - a thrown `ZatcaError` with code `API_TIMEOUT_ERR` / `API_CONN_ERR`
 *   - an HTTP response with status 429/500/502/503/504
 *
 * Never retries genuine rejections (4xx validation, explicit REJECTED).
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{
 *   label: string
 *   maxRetries?: number
 *   backoffMs?: number[]
 *   isTransientResult?: (result: T) => boolean
 * }} options
 * @returns {Promise<T>}
 */
export async function retryZatcaCall(fn, options) {
  const {
    label,
    maxRetries = 2,
    backoffMs = [3_000, 8_000],
    isTransientResult = (result) =>
      TRANSIENT_HTTP_STATUSES.has(
        /** @type {{ httpStatus?: number } | null | undefined} */ (result)?.httpStatus,
      ),
  } = options

  let lastResult
  let lastError

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (attempt > 0) {
      const wait = backoffMs[Math.min(attempt - 1, backoffMs.length - 1)]
      console.warn(
        `[zatca] retrying ${label} (attempt ${attempt}/${maxRetries}) after ${wait}ms`,
      )
      await sleep(wait)
    }
    try {
      const result = await fn()
      if (!isTransientResult(result)) return result
      lastResult = result
      lastError = undefined
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? /** @type {{ code?: string }} */ (err).code
          : undefined
      if (!TRANSIENT_ERROR_CODES.has(code)) throw err
      lastError = err
      lastResult = undefined
    }
  }

  if (lastError) throw lastError
  return lastResult
}
