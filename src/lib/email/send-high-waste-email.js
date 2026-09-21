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
 *   issued: string
 *   used: string
 *   waste: string
 *   analysis: string
 *   isBulkEstimate: boolean
 * }} p
 */
function highWasteCopy(locale, p) {
  const name = escapeHtml(p.recipientName || '')
  const restaurant = escapeHtml(p.restaurantName)
  const item = escapeHtml(p.itemName)
  const analysis = escapeHtml(p.analysis).replace(/\n/g, '<br />')

  if (locale === 'ar') {
    return {
      subject: `هدر مطبخ مرتفع: ${p.itemName} — ${p.restaurantName}`,
      intro: `مرحباً ${name}، دفعة مطبخ تحتاج انتباهاً في <strong>${restaurant}</strong>.`,
      body: `<strong>${item}</strong><br />المُصدر: <strong dir="ltr">${escapeHtml(p.issued)}</strong> · المستخدم: <strong dir="ltr">${escapeHtml(p.used)}</strong> · الهدر: <strong dir="ltr">${escapeHtml(p.waste)}</strong>`,
      analysis,
      disclaimer: p.isBulkEstimate
        ? 'هدر أصناف الجملة تقدير بالذكاء الاصطناعي وقد لا يكون صحيحاً دائماً.'
        : '',
      cta: 'فتح تقرير الهدر',
      footer: 'وصلك هذا البريد لأنك فعّلت تنبيهات الهدر المرتفع بالبريد لهذا المطعم.',
      textIntro: `مرحباً ${p.recipientName || ''}، دفعة مطبخ تحتاج انتباهاً في ${p.restaurantName}.`,
      textBody: `${p.itemName}\nالمُصدر: ${p.issued} · المستخدم: ${p.used} · الهدر: ${p.waste}`,
      textCta: 'فتح تقرير الهدر',
    }
  }

  return {
    subject: `High kitchen wastage: ${p.itemName} — ${p.restaurantName}`,
    intro: `Hi ${name}, a kitchen batch needs attention at <strong>${restaurant}</strong>.`,
    body: `<strong>${item}</strong><br />Issued: <strong dir="ltr">${escapeHtml(p.issued)}</strong> · Used: <strong dir="ltr">${escapeHtml(p.used)}</strong> · Waste: <strong dir="ltr">${escapeHtml(p.waste)}</strong>`,
    analysis,
    disclaimer: p.isBulkEstimate
      ? 'Bulk wastage is an AI estimate and is not always correct.'
      : '',
    cta: 'Open wastage report',
    footer:
      'You received this because you turned on high-waste email alerts for this restaurant.',
    textIntro: `Hi ${p.recipientName || ''}, a kitchen batch needs attention at ${p.restaurantName}.`,
    textBody: `${p.itemName}\nIssued: ${p.issued} · Used: ${p.used} · Waste: ${p.waste}`,
    textCta: 'Open wastage report',
  }
}

/**
 * @param {{
 *   to: string
 *   recipientName: string
 *   restaurantName: string
 *   itemName: string
 *   issued: string
 *   used: string
 *   waste: string
 *   analysis: string
 *   isBulkEstimate: boolean
 *   reportUrl: string
 *   preferredLocale?: string | null
 * }} p
 */
export async function sendHighWasteAlertEmail(p) {
  const from = hisaabiiSmtpFrom()
  const resolved = p.preferredLocale === 'ar' ? 'ar' : 'en'
  const copy = highWasteCopy(resolved, p)

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;" dir="${resolved === 'ar' ? 'rtl' : 'ltr'}">
      <h2 style="color: #0f172a;">${escapeHtml(copy.subject)}</h2>
      <p style="color: #334155; font-size: 15px;">${copy.intro}</p>
      <p style="color: #334155; font-size: 15px;">${copy.body}</p>
      ${copy.disclaimer ? `<p style="color: #92400e; font-size: 14px;">${escapeHtml(copy.disclaimer)}</p>` : ''}
      ${copy.analysis ? `<p style="color: #334155; font-size: 14px;">${copy.analysis}</p>` : ''}
      <p style="margin: 24px 0;">
        <a href="${escapeHtml(p.reportUrl)}" style="display: inline-block; background: #0f766e; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600;">${escapeHtml(copy.cta)}</a>
      </p>
      <p style="color: #64748b; font-size: 13px;">${escapeHtml(copy.footer)}</p>
    </div>
  `

  const text = [
    copy.textIntro,
    copy.textBody,
    copy.disclaimer,
    p.analysis,
    `${copy.textCta}: ${p.reportUrl}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  return sendSmtpMail({
    from,
    to: p.to,
    subject: copy.subject,
    html,
    text,
  })
}

/**
 * One email for a day-end report that has at least one high-waste line.
 *
 * @param {{
 *   to: string
 *   recipientName: string
 *   restaurantName: string
 *   reportDate: string
 *   itemNames: string
 *   analysis: string
 *   reportUrl: string
 *   preferredLocale?: string | null
 * }} p
 */
export async function sendDayEndHighWasteEmail(p) {
  const from = hisaabiiSmtpFrom()
  const locale = p.preferredLocale === 'ar' ? 'ar' : 'en'
  const name = escapeHtml(p.recipientName || '')
  const restaurant = escapeHtml(p.restaurantName)
  const items = escapeHtml(p.itemNames)
  const date = escapeHtml(p.reportDate)
  const analysis = escapeHtml(p.analysis).replace(/\n/g, '<br />')
  const copy =
    locale === 'ar'
      ? {
          subject: `هدر مرتفع في تقرير نهاية اليوم ${p.reportDate} — ${p.restaurantName}`,
          intro: `مرحباً ${name}، تقرير نهاية اليوم في <strong>${restaurant}</strong> يتضمن هدراً مرتفعاً.`,
          body: `التاريخ: <strong dir="ltr">${date}</strong><br />الأصناف: <strong>${items}</strong>`,
          cta: 'فتح تقرير نهاية اليوم',
          textIntro: `مرحباً ${p.recipientName || ''}، تقرير نهاية اليوم في ${p.restaurantName} يتضمن هدراً مرتفعاً.`,
          textBody: `التاريخ: ${p.reportDate}\nالأصناف: ${p.itemNames}`,
          textCta: 'فتح تقرير نهاية اليوم',
        }
      : {
          subject: `High day-end wastage ${p.reportDate} — ${p.restaurantName}`,
          intro: `Hi ${name}, the day-end report at <strong>${restaurant}</strong> includes high wastage.`,
          body: `Date: <strong dir="ltr">${date}</strong><br />Items: <strong>${items}</strong>`,
          cta: 'Open day-end report',
          textIntro: `Hi ${p.recipientName || ''}, the day-end report at ${p.restaurantName} includes high wastage.`,
          textBody: `Date: ${p.reportDate}\nItems: ${p.itemNames}`,
          textCta: 'Open day-end report',
        }
  const footer =
    locale === 'ar'
      ? 'وصلك هذا البريد لأنك فعّلت تنبيهات الهدر المرتفع بالبريد لهذا المطعم.'
      : 'You received this because you turned on high-waste email alerts for this restaurant.'

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;" dir="${locale === 'ar' ? 'rtl' : 'ltr'}">
      <h2 style="color: #0f172a;">${escapeHtml(copy.subject)}</h2>
      <p style="color: #334155; font-size: 15px;">${copy.intro}</p>
      <p style="color: #334155; font-size: 15px;">${copy.body}</p>
      ${analysis ? `<p style="color: #334155; font-size: 14px;">${analysis}</p>` : ''}
      <p style="margin: 24px 0;">
        <a href="${escapeHtml(p.reportUrl)}" style="display: inline-block; background: #0f766e; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600;">${escapeHtml(copy.cta)}</a>
      </p>
      <p style="color: #64748b; font-size: 13px;">${escapeHtml(footer)}</p>
    </div>
  `
  const text = [
    copy.textIntro,
    copy.textBody,
    p.analysis,
    `${copy.textCta}: ${p.reportUrl}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  return sendSmtpMail({
    from,
    to: p.to,
    subject: copy.subject,
    html,
    text,
  })
}
