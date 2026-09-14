import {
  getZatcaEnvironment,
  zatcaEnvironmentDisplayLabel,
  normalizeZatcaEnvironment,
} from '@/lib/zatca/env'

/**
 * Whether this business may submit Simplified invoices to ZATCA.
 *
 * Ready when both:
 * 1. device.productionCsid is present, AND
 * 2. device.environment matches the server `ZATCA_ENV` (via {@link getZatcaEnvironment})
 *
 * @param {{ zatcaEnvironment?: string | null }} _profile Unused — env is server-wide.
 * @param {{
 *   environment?: string | null
 *   productionCsid?: string | null
 *   onboardedAt?: Date | string | null
 * } | null | undefined} device
 * @returns {{
 *   ok: true
 *   selectedEnvironment: import('@/lib/zatca/env').ZatcaEnvironment
 * } | {
 *   ok: false
 *   code: 'ZATCA_ENVIRONMENT_NOT_ONBOARDED'
 *   message: string
 *   selectedEnvironment: import('@/lib/zatca/env').ZatcaEnvironment
 * }}
 */
export function getZatcaSubmissionReadiness(_profile, device) {
  const selectedEnvironment = getZatcaEnvironment()
  const label = zatcaEnvironmentDisplayLabel(selectedEnvironment)

  if (!device) {
    return notOnboardedForEnvironment(selectedEnvironment, label)
  }

  const deviceEnvironment = normalizeZatcaEnvironment(device.environment)
  const onboardedForSelectedEnvironment =
    deviceEnvironment === selectedEnvironment
  const hasProductionCsid = Boolean(device.productionCsid?.trim())

  if (!onboardedForSelectedEnvironment || !hasProductionCsid) {
    return notOnboardedForEnvironment(selectedEnvironment, label)
  }

  return { ok: true, selectedEnvironment }
}

/**
 * @param {import('@/lib/zatca/env').ZatcaEnvironment} selectedEnvironment
 * @param {string} label
 */
function notOnboardedForEnvironment(selectedEnvironment, label) {
  return {
    ok: false,
    code: /** @type {const} */ ('ZATCA_ENVIRONMENT_NOT_ONBOARDED'),
    message: `Please complete ZATCA onboarding for ${label} before submitting invoices`,
    selectedEnvironment,
  }
}
