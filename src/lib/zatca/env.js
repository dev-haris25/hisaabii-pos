/**
 * ZATCA environment helpers.
 *
 * Server-wide: `ZATCA_ENV` (sandbox | simulation | production) is the ZATCA
 * tier for every company. Per-company UI switching was removed — new profiles
 * store the same value; submit/onboard always resolve via {@link getZatcaEnvironment}.
 */

/** @typedef {'sandbox' | 'simulation' | 'production'} ZatcaEnvironment */

/**
 * @param {string | null | undefined} raw
 * @returns {ZatcaEnvironment}
 */
export function normalizeZatcaEnvironment(raw) {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (v === 'simulation' || v === 'production') return v
  return 'sandbox'
}

/**
 * Active ZATCA tier for this deployment (from `ZATCA_ENV`).
 * `_override` is ignored — kept so existing call sites keep compiling.
 * @param {string | null | undefined} [_override]
 * @returns {ZatcaEnvironment}
 */
export function getZatcaEnvironment(_override) {
  return normalizeZatcaEnvironment(process.env.ZATCA_ENV)
}

export function isZatcaEnabled() {
  return process.env.ZATCA_ENABLED !== 'false'
}

/** Sandbox dummy VAT (15 digits, starts/ends with 3) when profile VAT is invalid for ZATCA. */
export const ZATCA_SANDBOX_DUMMY_VAT = '300000000000003'

/** Distinct buyer VAT for sandbox standard invoices (must differ from seller). */
export const SANDBOX_STANDARD_BUYER_VAT = '311111111111113'

/** @param {string | null | undefined} vat */
export function isValidZatcaVatNumber(vat) {
  return /^3\d{13}3$/.test(String(vat ?? '').replace(/\D/g, ''))
}

/** @param {string | null | undefined} vat */
export function normalizeZatcaVatDigits(vat) {
  const v = String(vat ?? '').replace(/\D/g, '')
  return isValidZatcaVatNumber(v) ? v : ''
}

/** @param {string | null | undefined} vat */
export function normalizeSandboxVat(vat) {
  const normalized = normalizeZatcaVatDigits(vat)
  return normalized || ZATCA_SANDBOX_DUMMY_VAT
}

/**
 * @param {string | null | undefined} buyerVat
 * @param {string} sellerVat
 */
export function normalizeSandboxBuyerVat(buyerVat, sellerVat) {
  let v = normalizeZatcaVatDigits(buyerVat)
  if (!v || v === sellerVat) {
    v = SANDBOX_STANDARD_BUYER_VAT
    if (v === sellerVat) {
      v = ZATCA_SANDBOX_DUMMY_VAT
    }
  }
  return v
}

const ZATCA_GATEWAY_BASE = 'https://gw-fatoora.zatca.gov.sa/e-invoicing'

/**
 * Real ZATCA base URL for the given tier (or process env when override omitted).
 * @param {string | null | undefined} [envOverride]
 */
export function getZatcaBaseUrl(envOverride) {
  const env = getZatcaEnvironment(envOverride)
  if (env === 'simulation') return `${ZATCA_GATEWAY_BASE}/simulation`
  if (env === 'production') return `${ZATCA_GATEWAY_BASE}/core`
  return `${ZATCA_GATEWAY_BASE}/developer-portal`
}

/**
 * @param {string | null | undefined} [envOverride]
 * @returns {'sandbox' | 'production'}
 */
export function getZatcaApiEnvironment(envOverride) {
  const env = getZatcaEnvironment(envOverride)
  return env === 'sandbox' ? 'sandbox' : 'production'
}

/**
 * @param {string | null | undefined} [envOverride]
 * @returns {{ environment: 'sandbox' | 'production', sandboxUrl?: string, productionUrl?: string }}
 */
export function getZatcaApiConfig(envOverride) {
  const env = getZatcaEnvironment(envOverride)
  if (env === 'sandbox') {
    return { environment: 'sandbox' }
  }
  return { environment: 'production', productionUrl: getZatcaBaseUrl(env) }
}

/** EGS serial (ZATCA mandatory): 1-Manufacturer|2-Model|3-SerialNumber */
export function buildEgsSerialNumber(businessProfileId) {
  const shortId = businessProfileId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32)
  return `1-HisabiPOS|2-WebApp|3-${shortId}`
}

/** @param {ZatcaEnvironment} env */
export function zatcaEnvironmentDisplayLabel(env) {
  if (env === 'production') return 'Production'
  if (env === 'simulation') return 'Simulation'
  return 'Sandbox'
}
