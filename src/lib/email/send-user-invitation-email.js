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
 * @param {{ inviteeName: string, companyName: string, roleName: string }} p
 */
function invitationCopy(locale, p) {
  const name = escapeHtml(p.inviteeName || '')
  const company = escapeHtml(p.companyName)
  const role = escapeHtml(p.roleName)
  if (locale === 'ar') {
    return {
      subject: `تمت دعوتك للانضمام إلى ${p.companyName} على حسابي`,
      intro: `مرحباً ${name}، تمت دعوتك للانضمام إلى <strong>${company}</strong> على حسابي بصلاحية <strong>${role}</strong>.`,
      accept: 'قبول الدعوة',
      expires: 'تنتهي صلاحية هذا الرابط خلال 7 أيام. إذا لم تتوقع هذه الدعوة، يمكنك تجاهل هذا البريد بأمان.',
      textBody: `تمت دعوتك للانضمام إلى ${p.companyName} على حسابي بصلاحية ${p.roleName}.`,
      textAccept: 'قبول الدعوة',
      textExpires: 'تنتهي صلاحية هذا الرابط خلال 7 أيام.',
    }
  }
  return {
    subject: `You've been invited to join ${p.companyName} on Hisabi POS`,
    intro: `Hi ${name}, you've been invited to join <strong>${company}</strong> on Hisabi POS as <strong>${role}</strong>.`,
    accept: 'Accept invitation',
    expires: "This link expires in 7 days. If you didn't expect this invitation, you can safely ignore this email.",
    textBody: `You've been invited to join ${p.companyName} on Hisabi POS as ${p.roleName}.`,
    textAccept: 'Accept',
    textExpires: 'This link expires in 7 days.',
  }
}

/**
 * @param {{
 *   to: string
 *   inviteeName: string
 *   companyName: string
 *   roleName: string
 *   acceptUrl: string
 *   preferredLocale?: string | null
 *   locale?: string | null
 * }} p
 */
export async function sendUserInvitationEmail({
  to,
  inviteeName,
  companyName,
  roleName,
  acceptUrl,
  preferredLocale,
  locale,
}) {
  const from = hisaabiiSmtpFrom()
  const resolved = preferredLocale === 'ar' || locale === 'ar' ? 'ar' : 'en'
  const copy = invitationCopy(resolved, { inviteeName, companyName, roleName })

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;" dir="${resolved === 'ar' ? 'rtl' : 'ltr'}">
      <h2 style="color: #0f172a;">${escapeHtml(copy.subject)}</h2>
      <p style="color: #334155; font-size: 15px;">${copy.intro}</p>
      <p style="margin: 24px 0;">
        <a href="${escapeHtml(acceptUrl)}" style="display: inline-block; background: #0f766e; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600;">${escapeHtml(copy.accept)}</a>
      </p>
      <p style="color: #64748b; font-size: 13px;">${escapeHtml(copy.expires)}</p>
    </div>
  `

  await sendSmtpMail({
    from,
    to,
    subject: copy.subject,
    html,
    text: `${copy.textBody}\n\n${copy.textAccept}: ${acceptUrl}\n\n${copy.textExpires}`,
  })
}
