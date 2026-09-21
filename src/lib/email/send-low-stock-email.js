import { hisaabiiSmtpFrom, sendSmtpMail } from '@/lib/email/smtp-client'

/** @param {string} s */
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * @param {'ar' | 'en'} locale
 * @param {{
 *   recipientName: string
 *   restaurantName: string
 *   itemName: string
 *   qty: string
 *   threshold: string
 * }} p
 */
function lowStockCopy(locale, p) {
  const name = escapeHtml(p.recipientName || '')
  const restaurant = escapeHtml(p.restaurantName)
  const item = escapeHtml(p.itemName)
  const qty = escapeHtml(p.qty)
  const threshold = escapeHtml(p.threshold)

  if (locale === 'ar') {
    return {
      subject: `مخزون منخفض: ${p.itemName} — ${p.restaurantName}`,
      intro: `مرحباً ${name}، المخزون منخفض في <strong>${restaurant}</strong>.`,
      body: `<strong>${item}</strong> عند <strong dir="ltr">${qty}</strong> (الحد <strong dir="ltr">${threshold}</strong>).`,
      cta: 'فتح صنف المخزون',
      footer: 'وصلك هذا البريد لأن تنبيهات المخزون المنخفض مفعّلة لهذا المطعم.',
      textIntro: `مرحباً ${p.recipientName || ''}، المخزون منخفض في ${p.restaurantName}.`,
      textBody: `${p.itemName} عند ${p.qty} (الحد ${p.threshold}).`,
      textCta: 'فتح صنف المخزون',
    }
  }

  return {
    subject: `Low stock: ${p.itemName} — ${p.restaurantName}`,
    intro: `Hi ${name}, stock is low at <strong>${restaurant}</strong>.`,
    body: `<strong>${item}</strong> is at <strong dir="ltr">${qty}</strong> (threshold <strong dir="ltr">${threshold}</strong>).`,
    cta: 'Open stock item',
    footer: 'You received this because low-stock email alerts are enabled for this restaurant.',
    textIntro: `Hi ${p.recipientName || ''}, stock is low at ${p.restaurantName}.`,
    textBody: `${p.itemName} is at ${p.qty} (threshold ${p.threshold}).`,
    textCta: 'Open stock item',
  }
}

/**
 * @param {{
 *   to: string
 *   recipientName: string
 *   restaurantName: string
 *   itemName: string
 *   qty: string
 *   threshold: string
 *   stockUrl: string
 *   preferredLocale?: string | null
 * }} p
 */
export async function sendLowStockAlertEmail(p) {
  const from = hisaabiiSmtpFrom()
  const resolved = p.preferredLocale === 'ar' ? 'ar' : 'en'
  const copy = lowStockCopy(resolved, {
    recipientName: p.recipientName,
    restaurantName: p.restaurantName,
    itemName: p.itemName,
    qty: p.qty,
    threshold: p.threshold,
  })

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;" dir="${resolved === 'ar' ? 'rtl' : 'ltr'}">
      <h2 style="color: #0f172a;">${escapeHtml(copy.subject)}</h2>
      <p style="color: #334155; font-size: 15px;">${copy.intro}</p>
      <p style="color: #334155; font-size: 15px;">${copy.body}</p>
      <p style="margin: 24px 0;">
        <a href="${escapeHtml(p.stockUrl)}" style="display: inline-block; background: #0f766e; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600;">${escapeHtml(copy.cta)}</a>
      </p>
      <p style="color: #64748b; font-size: 13px;">${escapeHtml(copy.footer)}</p>
    </div>
  `

  const text = `${copy.textIntro}\n\n${copy.textBody}\n\n${copy.textCta}: ${p.stockUrl}`

  return sendSmtpMail({
    from,
    to: p.to,
    subject: copy.subject,
    html,
    text,
  })
}
