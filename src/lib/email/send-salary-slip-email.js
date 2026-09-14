import { buildSmtpFrom, sendSmtpMail } from '@/lib/email/smtp-client'

/** @param {string} s */
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * @param {'ar' | 'en'} locale
 */
function salarySlipCopy(locale) {
  if (locale === 'ar') {
    return {
      salarySlip: 'قسيمة راتب',
      employee: 'الموظف',
      netPay: 'صافي الراتب',
      attached: 'قسيمة الراتب (PDF) مرفقة بهذا البريد.',
      textSeeAttached: 'راجع ملف PDF المرفق.',
    }
  }
  return {
    salarySlip: 'Salary slip',
    employee: 'Employee',
    netPay: 'Net pay',
    attached: 'The salary slip PDF is attached to this email.',
    textSeeAttached: 'See attached PDF.',
  }
}

/**
 * @param {{
 *   to: string
 *   cc?: string | null
 *   businessDisplayName: string
 *   replyToEmail: string
 *   subject: string
 *   message: string
 *   voucherNumber: string
 *   employeeName: string
 *   netPay: string
 *   pdfBuffer: Buffer
 *   pdfFilename: string
 *   preferredLocale?: string | null
 *   locale?: string | null
 * }} p
 */
export async function sendSalarySlipEmail(p) {
  const from = buildSmtpFrom(`${p.businessDisplayName} via Hisabi POS`)
  const resolved = p.preferredLocale === 'ar' || p.locale === 'ar' ? 'ar' : 'en'
  const copy = salarySlipCopy(resolved)

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1e293b;" dir="${resolved === 'ar' ? 'rtl' : 'ltr'}">
      <p style="white-space: pre-wrap; font-size: 15px; line-height: 1.6;">${escapeHtml(p.message)}</p>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px 20px; margin-top: 24px;">
        <p style="margin: 0; font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">${escapeHtml(copy.salarySlip)}</p>
        <p style="margin: 4px 0 0; font-size: 18px; font-weight: 700;">${escapeHtml(p.voucherNumber)}</p>
        <p style="margin: 12px 0 0; font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">${escapeHtml(copy.employee)}</p>
        <p style="margin: 4px 0 0; font-size: 16px; font-weight: 600;">${escapeHtml(p.employeeName)}</p>
        <p style="margin: 12px 0 0; font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">${escapeHtml(copy.netPay)}</p>
        <p style="margin: 4px 0 0; font-size: 18px; font-weight: 700;">${escapeHtml(p.netPay)}</p>
      </div>
      <p style="font-size: 13px; color: #94a3b8; margin-top: 24px;">${escapeHtml(copy.attached)}</p>
    </div>
  `

  await sendSmtpMail({
    from,
    to: p.to,
    ...(p.cc ? { cc: p.cc } : {}),
    replyTo: p.replyToEmail,
    subject: p.subject,
    html,
    text: `${p.message}\n\n${copy.salarySlip}: ${p.voucherNumber}\n${copy.employee}: ${p.employeeName}\n${copy.netPay}: ${p.netPay}\n\n${copy.textSeeAttached}`,
    attachments: [{ filename: p.pdfFilename, content: p.pdfBuffer }],
  })
}
