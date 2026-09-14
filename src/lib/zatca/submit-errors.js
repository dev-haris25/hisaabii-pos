/**
 * @param {import('@talha7k/zatca').ZatcaSubmitResult} result
 */
export function formatZatcaSubmitRejection(result) {
  const parts = []

  if (result.response?.clearanceStatus) {
    parts.push(`clearance: ${result.response.clearanceStatus}`)
  }
  if (result.response?.reportingStatus) {
    parts.push(`reporting: ${result.response.reportingStatus}`)
  }

  if (result.alerts?.length) {
    for (const alert of result.alerts) {
      const prefix = alert.severity === 'error' ? 'ERROR' : 'WARNING'
      parts.push(`${prefix} ${alert.code}: ${alert.message}`)
    }
  }

  if (result.error?.message) {
    parts.push(result.error.message)
  }

  if (result.response?.warnings?.length) {
    for (const w of result.response.warnings) {
      parts.push(`WARNING ${w.code}: ${w.message}`)
    }
  }

  const fromRaw = parseValidationResultsBody(result.rawBody)
  if (fromRaw) {
    parts.push(fromRaw)
  } else if (parts.length === 0 && result.rawBody) {
    parts.push(String(result.rawBody).slice(0, 400))
  }

  const unique = [...new Set(parts.filter(Boolean))]
  return unique.join('; ') || 'ZATCA rejected the invoice'
}

/**
 * @param {string | undefined} rawBody
 */
function parseValidationResultsBody(rawBody) {
  if (!rawBody) return null
  try {
    const data = JSON.parse(rawBody)
    const vr = data.validationResults
    if (!vr) return null

    /** @type {string[]} */
    const lines = []
    for (const m of vr.errorMessages || []) {
      lines.push(`ERROR ${m.code}: ${m.message}`)
    }
    for (const m of vr.warningMessages || []) {
      lines.push(`WARNING ${m.code}: ${m.message}`)
    }
    if (vr.status) {
      lines.unshift(`status: ${vr.status}`)
    }
    return lines.length > 0 ? lines.join('; ') : null
  } catch {
    return null
  }
}
