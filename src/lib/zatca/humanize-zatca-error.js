/**
 * Map raw ZATCA / Hisabi ZATCA error strings to human-readable guidance.
 *
 * Server errors are often concatenated like:
 *   "ZATCA submission rejected: clearance: NOT_CLEARED; ERROR QRCODE_INVALID: …; ERROR BR-KSA-27: …"
 * This module extracts every distinct code/pattern and returns one entry per issue.
 *
 * English title/message/actionHint on each issue are fallbacks; prefer next-intl
 * `ZatcaErrors` via {@link localizeHumanizedZatcaError} / format helpers with `t`.
 */

/**
 * @typedef {{
 *   ruleId: string
 *   title: string
 *   message: string
 *   actionHint: string
 *   codes: string[]
 * }} HumanizedZatcaIssue
 */

/**
 * @typedef {{
 *   title: string
 *   issues: HumanizedZatcaIssue[]
 *   raw: string
 *   matchedCodes: string[]
 * }} HumanizedZatcaError
 */

/** @type {Array<{ id: string, match: (code: string, raw: string) => boolean, title: string, message: string, actionHint: string }>} */
const RULES = [
  {
    id: 'qrcode',
    match: (code) =>
      code === 'QRCODE_INVALID' ||
      code === 'BR-KSA-27' ||
      code === 'KSA-27' ||
      code.startsWith('QRCODE_'),
    title: 'QR Code Problem',
    message:
      "The invoice's QR code doesn't meet ZATCA's format requirements.",
    actionHint:
      "This is usually a system issue, not something you caused — contact support if it keeps happening.",
  },
  {
    id: 'certificate',
    match: (code, raw) =>
      code === 'certificate-issuer-name' ||
      code === 'invalid-signing-certificate' ||
      code === 'certificate-permissions' ||
      code.includes('certificate') ||
      /certificate-issuer-name|invalid-signing-certificate|certificate-permissions/i.test(
        raw,
      ) ||
      /does not match the supplied CSID|No ZATCA certificate matches|ZATCA private key is missing/i.test(
        raw,
      ),
    title: 'Certificate Mismatch',
    message:
      "Your ZATCA certificate doesn't match your business's tax registration.",
    actionHint:
      'Go to Company Settings → ZATCA Status and re-complete onboarding.',
  },
  {
    id: 'production_cert',
    match: (code, raw) =>
      code === 'ZATCA_PRODUCTION_CERT_MISMATCH' ||
      /production ZATCA certificate does not match/i.test(raw),
    title: 'Production Certificate Issue',
    message: 'Your production ZATCA setup needs to be reconnected.',
    actionHint: 'Re-run ZATCA onboarding for Production in Company Settings.',
  },
  {
    id: 'not_onboarded',
    match: (code, raw) =>
      code === 'ZATCA_NOT_ONBOARDED' ||
      code === 'ZATCA_ENVIRONMENT_NOT_ONBOARDED' ||
      /Complete ZATCA onboarding|complete ZATCA onboarding for/i.test(raw),
    title: 'ZATCA Setup Incomplete',
    message:
      "Your business hasn't finished connecting to ZATCA yet for this environment.",
    actionHint:
      'Complete ZATCA onboarding in Company Settings before sending invoices.',
  },
  {
    id: 'address',
    match: (code, raw) => {
      const upper = String(code || '').toUpperCase()
      const addressCodes = new Set([
        'BR-KSA-09',
        'BR-KSA-10',
        'BR-KSA-11',
        'BR-KSA-12',
        'BR-KSA-13',
        'BR-KSA-14',
        'BR-KSA-16',
        'BR-KSA-18',
        'BR-KSA-19',
        'BR-KSA-20',
        'BR-KSA-21',
        'BR-KSA-22',
        'BR-KSA-F-06',
        'BR-KSA-F-04',
      ])
      if (addressCodes.has(upper)) return true
      // Only treat other BR-KSA-* as address when the message clearly mentions address fields
      if (
        /^BR-KSA-/i.test(upper) &&
        /street|building|district|city|postal.?code|address/i.test(raw)
      ) {
        return true
      }
      // Message-only (no extracted code): address wording + a BR-KSA rule in the raw string
      if (
        !upper &&
        /street|building|district|city|postal.?code|address/i.test(raw) &&
        /BR-KSA-/i.test(raw)
      ) {
        return true
      }
      return false
    },
    title: 'Missing Address Information',
    message:
      "Your company's (or the buyer's) address is missing required details ZATCA needs.",
    actionHint:
      'Check that street, building number, city, and district are all filled in under Company Settings or the client\'s profile.',
  },
  {
    id: 'vat',
    match: (code) =>
      /^BR-S-\d+$/i.test(code) ||
      code === 'BR-CO-15' ||
      code === 'BR-CO-16' ||
      code === 'BR-CO-17' ||
      code === 'BR-KSA-51' ||
      code === 'BR-KSA-52' ||
      code === 'BR-KSA-53',
    title: 'VAT Calculation Issue',
    message:
      "The VAT amounts on this invoice don't add up the way ZATCA expects.",
    actionHint: 'Double-check the VAT rate selected on each line item.',
  },
  {
    id: 'sequence',
    match: (code) =>
      code === 'BR-KSA-31' ||
      code === 'BR-KSA-33' ||
      code === 'KSA-9' ||
      code === 'BR-KSA-61' ||
      code === 'BR-KSA-62',
    title: 'Invoice Sequence Issue',
    message:
      "There's a gap or duplicate in your invoice numbering sequence.",
    actionHint:
      'This is a system-level issue — contact support rather than retrying with the same invoice.',
  },
  {
    id: 'xsd',
    match: (code) =>
      code === 'XSD_ZATCA_INVALID' ||
      code.startsWith('XSD_') ||
      code === 'schema-error',
    title: 'Invoice Format Issue',
    message:
      "ZATCA couldn't read the invoice file structure (XML schema).",
    actionHint:
      'This is usually a system issue — contact support with this invoice number.',
  },
  {
    id: 'otp_csid',
    match: (code, raw) =>
      /OTP|one.?time|CSID|compliance request|dispositionMessage/i.test(raw) ||
      code === 'Invalid-OTP' ||
      code === 'invalid-otp',
    title: 'Onboarding Code Issue',
    message:
      'ZATCA rejected the onboarding request (often an expired or wrong OTP).',
    actionHint:
      'Generate a fresh OTP in the Fatoora portal and try onboarding again.',
  },
]

const FALLBACK = {
  id: 'fallback',
  title: 'Submission Failed',
  message:
    "ZATCA rejected this invoice for a reason we don't have a simpler explanation for yet.",
  actionHint:
    'Contact support with this invoice number so we can look into the exact cause.',
}

/**
 * @param {(key: string, values?: Record<string, unknown>) => string} t
 * @param {string} key
 * @param {string} fallback
 * @param {Record<string, unknown>} [values]
 */
function translateOrFallback(t, key, fallback, values) {
  if (typeof t !== 'function') return fallback
  try {
    if (typeof t.has === 'function' && !t.has(key)) return fallback
    const value = values ? t(key, values) : t(key)
    if (value == null || value === '' || value === key) return fallback
    return String(value)
  } catch {
    return fallback
  }
}

/**
 * Apply `ZatcaErrors` translations onto a humanized result (keeps English fallbacks).
 * @param {HumanizedZatcaError} humanized
 * @param {((key: string, values?: Record<string, unknown>) => string) | null | undefined} t
 * @returns {HumanizedZatcaError}
 */
export function localizeHumanizedZatcaError(humanized, t) {
  if (typeof t !== 'function') return humanized

  const issues = humanized.issues.map((issue) => {
    const id = issue.ruleId || FALLBACK.id
    return {
      ...issue,
      title: translateOrFallback(t, `rules.${id}.title`, issue.title),
      message: translateOrFallback(t, `rules.${id}.message`, issue.message),
      actionHint: translateOrFallback(
        t,
        `rules.${id}.actionHint`,
        issue.actionHint,
      ),
    }
  })

  const title =
    issues.length === 1
      ? issues[0].title
      : translateOrFallback(t, 'multiTitle', 'Submission Failed')

  return {
    ...humanized,
    title,
    issues,
  }
}

/**
 * Extract ZATCA / Hisabi error codes from a concatenated rejection string.
 * @param {string} raw
 * @returns {string[]}
 */
export function extractZatcaErrorCodes(raw) {
  const text = String(raw ?? '')
  /** @type {Set<string>} */
  const codes = new Set()

  // "ERROR QRCODE_INVALID: …" / "WARNING BR-KSA-27: …"
  for (const m of text.matchAll(/\b(?:ERROR|WARNING)\s+([A-Za-z0-9._-]+)\s*:/gi)) {
    codes.add(normalizeCode(m[1]))
  }

  // "[some-code] message" from CSID helpers
  for (const m of text.matchAll(/\[([A-Za-z0-9._-]+)\]/g)) {
    codes.add(normalizeCode(m[1]))
  }

  // Bare well-known tokens
  const barePatterns = [
    /\b(QRCODE_[A-Z0-9_]+)\b/gi,
    /\b(BR-KSA-[A-Z0-9-]+)\b/gi,
    /\b(BR-S-\d+)\b/gi,
    /\b(BR-CO-\d+)\b/gi,
    // Standalone KSA-n (not the suffix inside BR-KSA-n)
    /(?<!BR-)KSA-\d+\b/gi,
    /\b(XSD_ZATCA_[A-Z0-9_]+)\b/gi,
    /\b(XSD_[A-Z0-9_]+)\b/gi,
    /\b(certificate-issuer-name)\b/gi,
    /\b(invalid-signing-certificate)\b/gi,
    /\b(certificate-permissions)\b/gi,
    /\b(ZATCA_PRODUCTION_CERT_MISMATCH)\b/gi,
    /\b(ZATCA_ENVIRONMENT_NOT_ONBOARDED)\b/gi,
    /\b(ZATCA_NOT_ONBOARDED)\b/gi,
    /\b(Invalid-OTP)\b/gi,
  ]
  for (const re of barePatterns) {
    for (const m of text.matchAll(re)) {
      const token = m[1] ?? m[0]
      codes.add(normalizeCode(token))
    }
  }

  return [...codes].filter(Boolean)
}

/**
 * @param {string} code
 */
function normalizeCode(code) {
  const c = String(code ?? '').trim()
  if (!c) return ''
  // Preserve hyphenated certificate codes in lowercase (as ZATCA returns them)
  if (c.includes('-') && /^[a-z0-9.-]+$/i.test(c) && !/^BR-/i.test(c) && !/^KSA-/i.test(c)) {
    return c.toLowerCase()
  }
  return c.toUpperCase()
}

/**
 * @param {string} code
 * @param {string} raw
 */
function ruleForCode(code, raw) {
  // Prefer more specific rules first (production cert before generic certificate)
  const ordered = [
    RULES.find((r) => r.id === 'production_cert'),
    RULES.find((r) => r.id === 'not_onboarded'),
    RULES.find((r) => r.id === 'qrcode'),
    RULES.find((r) => r.id === 'sequence'),
    RULES.find((r) => r.id === 'vat'),
    RULES.find((r) => r.id === 'address'),
    RULES.find((r) => r.id === 'xsd'),
    RULES.find((r) => r.id === 'otp_csid'),
    RULES.find((r) => r.id === 'certificate'),
  ].filter(Boolean)

  for (const rule of ordered) {
    if (rule.match(code, raw)) return rule
  }
  return null
}

/**
 * @param {string | null | undefined} rawErrorString
 * @returns {HumanizedZatcaError}
 */
export function humanizeZatcaError(rawErrorString) {
  const raw = String(rawErrorString ?? '').trim()
  const codes = extractZatcaErrorCodes(raw)

  /** @type {Map<string, HumanizedZatcaIssue>} */
  const byRuleId = new Map()

  for (const code of codes) {
    const rule = ruleForCode(code, raw)
    if (!rule) continue
    const existing = byRuleId.get(rule.id)
    if (existing) {
      if (!existing.codes.includes(code)) existing.codes.push(code)
      continue
    }
    byRuleId.set(rule.id, {
      ruleId: rule.id,
      title: rule.title,
      message: rule.message,
      actionHint: rule.actionHint,
      codes: [code],
    })
  }

  // Message-only heuristics when no codes were extracted
  if (byRuleId.size === 0 && raw) {
    const orderedForMessage = [
      'production_cert',
      'not_onboarded',
      'qrcode',
      'sequence',
      'vat',
      'address',
      'xsd',
      'otp_csid',
      'certificate',
    ]
    for (const id of orderedForMessage) {
      const rule = RULES.find((r) => r.id === id)
      if (!rule?.match('', raw)) continue
      // Prefer specific cert mismatch over the generic certificate bucket
      if (id === 'certificate' && byRuleId.has('production_cert')) continue
      byRuleId.set(rule.id, {
        ruleId: rule.id,
        title: rule.title,
        message: rule.message,
        actionHint: rule.actionHint,
        codes: [],
      })
    }
  }

  /** @type {HumanizedZatcaIssue[]} */
  let issues = [...byRuleId.values()]

  if (issues.length === 0) {
    issues = [
      {
        ruleId: FALLBACK.id,
        title: FALLBACK.title,
        message: FALLBACK.message,
        actionHint: FALLBACK.actionHint,
        codes: codes.length ? codes : [],
      },
    ]
  }

  return {
    title: issues.length === 1 ? issues[0].title : 'Submission Failed',
    issues,
    raw,
    matchedCodes: codes,
  }
}

/**
 * Rebuild humanized issues from rule ids (what API responses carry instead of
 * the raw ZATCA text — rules §5).
 * @param {string[] | null | undefined} ruleIds
 * @returns {HumanizedZatcaError}
 */
export function humanizedZatcaErrorFromRuleIds(ruleIds) {
  /** @type {HumanizedZatcaIssue[]} */
  const issues = []
  for (const id of Array.isArray(ruleIds) ? ruleIds : []) {
    const rule = RULES.find((r) => r.id === id)
    if (!rule || issues.some((i) => i.ruleId === id)) continue
    issues.push({
      ruleId: rule.id,
      title: rule.title,
      message: rule.message,
      actionHint: rule.actionHint,
      codes: [],
    })
  }
  if (issues.length === 0) {
    issues.push({
      ruleId: FALLBACK.id,
      title: FALLBACK.title,
      message: FALLBACK.message,
      actionHint: FALLBACK.actionHint,
      codes: [],
    })
  }
  return {
    title: issues.length === 1 ? issues[0].title : 'Submission Failed',
    issues,
    raw: '',
    matchedCodes: [],
  }
}

/**
 * Plain-text summary for inline banners (onboarding forms, etc.). Never
 * includes the raw ZATCA response (rules §5).
 * @param {string[] | null | undefined} ruleIds from `details.zatcaRuleIds`
 * @param {((key: string, values?: Record<string, unknown>) => string) | null | undefined} [t]
 *   Optional `useTranslations('ZatcaErrors')` translator.
 */
export function formatZatcaRuleIdsText(ruleIds, t) {
  const { issues } = localizeHumanizedZatcaError(
    humanizedZatcaErrorFromRuleIds(ruleIds),
    t,
  )
  return issues
    .flatMap((issue) => [issue.title, issue.message, issue.actionHint])
    .filter(Boolean)
    .join('\n')
}

/**
 * Rule ids for a raw ZATCA error — safe to send to the client.
 * @param {string | null | undefined} rawErrorString
 * @returns {string[]}
 */
export function zatcaRuleIdsFromRaw(rawErrorString) {
  return humanizeZatcaError(rawErrorString).issues.map((i) => i.ruleId)
}

/**
 * Whether a message / API error looks like a ZATCA rejection worth humanizing.
 * @param {string | null | undefined} message
 * @param {string | null | undefined} [code]
 */
export function isZatcaErrorMessage(message, code) {
  const c = String(code ?? '')
  if (
    c === 'ZATCA_ERROR' ||
    c === 'ZATCA_NOT_ONBOARDED' ||
    c === 'ZATCA_ENVIRONMENT_NOT_ONBOARDED' ||
    c === 'ZATCA_PRODUCTION_CERT_MISMATCH'
  ) {
    return true
  }
  const m = String(message ?? '')
  if (!m) return false
  return (
    /ZATCA|CSID|compliance check failed|submission rejected|QRCODE_|BR-KSA-|certificate-issuer|invalid-signing-certificate|certificate-permissions|\bInvalid-OTP\b|\bOTP\b|one[-\s]?time\s*password|compliance.?request|dispositionMessage/i.test(
      m,
    )
  )
}
