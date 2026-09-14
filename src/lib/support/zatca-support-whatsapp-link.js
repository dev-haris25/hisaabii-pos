/** Fixed English WhatsApp prefill — not localized. */
const ZATCA_SUPPORT_MESSAGE =
  "Hi, I'm having trouble completing ZATCA onboarding for my restaurant on Hisabi POS. Can you help me?"

/**
 * Builds a WhatsApp click-to-chat URL for ZATCA onboarding support.
 * Number comes from `NEXT_PUBLIC_ZATCA_SUPPORT_WHATSAPP` (digits only, country code + number).
 *
 * @returns {string | null}
 */
export function getZatcaSupportWhatsappLink() {
  const raw = process.env.NEXT_PUBLIC_ZATCA_SUPPORT_WHATSAPP
  if (typeof raw !== 'string') return null
  const number = raw.replace(/\D/g, '')
  if (!number) return null
  return `https://wa.me/${number}?text=${encodeURIComponent(ZATCA_SUPPORT_MESSAGE)}`
}
