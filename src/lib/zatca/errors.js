/**
 * @param {unknown} complianceResponse from @talha7k/zatca requestComplianceCSID
 * @param {string} fallback
 */
export function formatZatcaCsidRejection(complianceResponse, fallback) {
  const err = complianceResponse?.error
  if (err?.message?.trim()) {
    const code = err.code ? `[${err.code}] ` : ''
    return `${code}${err.message}`.slice(0, 500)
  }
  return fallback
}

/**
 * @param {string} rawBody
 * @param {number} httpStatus
 */
export function parseZatcaCsidHttpError(rawBody, httpStatus) {
  try {
    const data = JSON.parse(rawBody)
    const disposition = data.dispositionMessage
    const errors = data.errors
    if (Array.isArray(errors) && errors.length > 0) {
      const parts = errors.map((e) => {
        if (typeof e === 'string') return e
        const code = e?.code ? `[${e.code}] ` : ''
        const msg = e?.message || JSON.stringify(e)
        return `${code}${msg}`
      })
      const prefix = disposition ? `${disposition}: ` : ''
      return `${prefix}${parts.join('; ')}`.slice(0, 500)
    }
    if (disposition) return String(disposition).slice(0, 500)
  } catch {
    // ignore
  }
  return `ZATCA HTTP ${httpStatus}: ${String(rawBody).slice(0, 300)}`
}
