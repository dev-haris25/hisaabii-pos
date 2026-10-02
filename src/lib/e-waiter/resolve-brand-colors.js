import { DEFAULT_E_WAITER_BRAND_COLORS } from '@/lib/e-waiter/default-brand-colors'

const HEX_RE = /^#[0-9A-Fa-f]{6}$/

/**
 * @param {unknown} value
 * @param {string} fallback
 */
function hexOrFallback(value, fallback) {
  const s = String(value ?? '').trim()
  return HEX_RE.test(s) ? s : fallback
}

/**
 * Resolve white-label colors: admin brand* or Hisabi code defaults.
 *
 * @param {{
 *   brandPrimaryColor?: string | null
 *   brandSecondaryColor?: string | null
 *   brandAccentColor?: string | null
 *   brandBackgroundColor?: string | null
 *   brandTextColor?: string | null
 * } | null | undefined} profile
 */
export function resolveEWaiterBrandColors(profile) {
  return {
    primary: hexOrFallback(
      profile?.brandPrimaryColor,
      DEFAULT_E_WAITER_BRAND_COLORS.primary,
    ),
    secondary: hexOrFallback(
      profile?.brandSecondaryColor,
      DEFAULT_E_WAITER_BRAND_COLORS.secondary,
    ),
    accent: hexOrFallback(
      profile?.brandAccentColor,
      DEFAULT_E_WAITER_BRAND_COLORS.accent,
    ),
    background: hexOrFallback(
      profile?.brandBackgroundColor,
      DEFAULT_E_WAITER_BRAND_COLORS.background,
    ),
    text: hexOrFallback(
      profile?.brandTextColor,
      DEFAULT_E_WAITER_BRAND_COLORS.text,
    ),
  }
}
