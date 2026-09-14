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
 * @param {'register' | 'password_reset'} purpose
 * @param {string} name
 */
function otpCopy(locale, purpose, name) {
  const safeName = escapeHtml(name || '')
  if (locale === 'ar') {
    if (purpose === 'register') {
      return {
        subject: 'تحقق من حساب حسابي POS',
        intro: `مرحباً ${safeName}، استخدم هذا الرمز للتحقق من بريدك الإلكتروني وإكمال إنشاء حسابك في حسابي POS.`,
        expires: 'ينتهي صلاحية هذا الرمز خلال 10 دقائق. إذا لم تطلب هذا الرمز، يمكنك تجاهل هذا البريد بأمان.',
        yourCode: 'رمزك',
        textExpires: 'ينتهي صلاحية هذا الرمز خلال 10 دقائق.',
      }
    }
    return {
      subject: 'إعادة تعيين كلمة مرور حسابي POS',
      intro: `مرحباً ${safeName}، استخدم هذا الرمز لإعادة تعيين كلمة مرور حسابي POS.`,
      expires: 'ينتهي صلاحية هذا الرمز خلال 10 دقائق. إذا لم تطلب هذا الرمز، يمكنك تجاهل هذا البريد بأمان.',
      yourCode: 'رمزك',
      textExpires: 'ينتهي صلاحية هذا الرمز خلال 10 دقائق.',
    }
  }
  if (purpose === 'register') {
    return {
      subject: 'Verify your Hisabi POS account',
      intro: `Hi ${safeName}, use this code to verify your email and finish creating your Hisabi POS account.`,
      expires: "This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.",
      yourCode: 'Your code',
      textExpires: 'This code expires in 10 minutes.',
    }
  }
  return {
    subject: 'Reset your Hisabi POS password',
    intro: `Hi ${safeName}, use this code to reset your Hisabi POS password.`,
    expires: "This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.",
    yourCode: 'Your code',
    textExpires: 'This code expires in 10 minutes.',
  }
}

/**
 * @param {{
 *   to: string
 *   name: string
 *   code: string
 *   purpose: 'register' | 'password_reset'
 *   preferredLocale?: string | null
 *   locale?: string | null
 * }} p
 */
export async function sendOtpEmail({ to, name, code, purpose, preferredLocale, locale }) {
  const from = hisaabiiSmtpFrom()
  const resolved = preferredLocale === 'ar' || locale === 'ar' ? 'ar' : 'en'
  const copy = otpCopy(resolved, purpose, name)

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;" dir="${resolved === 'ar' ? 'rtl' : 'ltr'}">
      <h2 style="color: #0f172a;">${escapeHtml(copy.subject)}</h2>
      <p style="color: #334155; font-size: 15px;">${copy.intro}</p>
      <div style="background: #f1f5f9; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
        <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #0f172a;" dir="ltr">${escapeHtml(code)}</span>
      </div>
      <p style="color: #64748b; font-size: 13px;">${escapeHtml(copy.expires)}</p>
    </div>
  `

  return sendSmtpMail({
    from,
    to,
    subject: copy.subject,
    html,
    text: `${copy.intro.replace(/<[^>]+>/g, '')}\n\n${copy.yourCode}: ${code}\n\n${copy.textExpires}`,
  })
}
