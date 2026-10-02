/**
 * Code-only Hisabi brand fallbacks for the E-Waiter white-label public menu.
 * Not stored on BusinessProfile — used later when a restaurant leaves brand*Color null.
 *
 * Sourced from light-theme tokens in `src/styles/hisabi-design-system.css`.
 * Adjust here if product wants different white-label defaults.
 */
export const DEFAULT_E_WAITER_BRAND_COLORS = Object.freeze({
  /** `--hisabi-primary` */
  primary: '#00342b',
  /** `--hisabi-secondary` */
  secondary: '#735c00',
  /** `--hisabi-gold` (CTA / accent; clearer than secondary-container yellow) */
  accent: '#d4af37',
  /** `--hisabi-background` */
  background: '#f8f9ff',
  /** `--hisabi-on-background` */
  text: '#0b1c30',
})
