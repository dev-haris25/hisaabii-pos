import { jsonError, jsonOk } from '@/lib/api/json-response'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { sendSalarySlipEmail } from '@/lib/email/send-salary-slip-email'
import {
  generateSalarySlipPdfBuffer,
  safePdfFilename,
} from '@/lib/hr/salary-slips/generate-salary-slip-pdf'
import { salarySlipEmailBodySchema } from '@/lib/hr/salary-slips/salary-slip-email-body-schema'
import { salarySlipPrintInclude } from '@/lib/hr/salary-slips/salary-slip-print-include'
import { prisma } from '@/lib/prisma'
import { formatSarAmount } from '@/lib/settings/format-helpers'

export const runtime = 'nodejs'

/** @param {string | number | null | undefined} v @param {string | null | undefined} [locale] */
function formatAmount(v, locale = 'en') {
  return formatSarAmount(v, locale)
}

/** @param {import('next/server').NextRequest} request @param {{ params: Promise<{ id: string }> }} ctx */
export async function POST(request, ctx) {
  const auth = await authorizeBusinessRequest(request)
  if (auth.error) return auth.error
  const { session, profile } = auth
  const { id } = await ctx.params
  if (!id) return jsonError(400, 'VALIDATION_ERROR', 'Missing id')

  let body
  try {
    body = await request.json()
  } catch {
    return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
  }

  const parsed = salarySlipEmailBodySchema.safeParse(body)
  if (!parsed.success) return jsonError(400, 'VALIDATION_ERROR', 'Invalid input')

  const slip = await prisma.salarySlip.findFirst({
    where: { id, businessProfileId: profile.id, ...WHERE_NOT_DELETED },
    include: salarySlipPrintInclude,
  })
  if (!slip) return jsonError(404, 'NOT_FOUND', 'Salary slip not found')

  const replyToEmail =
    session.email?.trim() || profile.email?.trim() || null
  if (!replyToEmail) {
    return jsonError(500, 'SERVER_ERROR', 'No reply-to email available')
  }

  const cookieHeader = request.headers.get('cookie') ?? ''
  const origin =
    process.env.NODE_ENV === 'production'
      ? process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
      : new URL(request.url).origin

  try {
    const pdfBuffer = await generateSalarySlipPdfBuffer({
      salarySlipId: id,
      locale: parsed.data.locale,
      origin,
      cookieHeader,
    })

    const businessDisplayName =
      profile.companyNameEn?.trim() || profile.companyNameAr?.trim() || 'Hisabi POS'
    const voucherNumber = slip.voucherNumber?.trim() || 'Salary slip'
    const employeeName = slip.employee?.name?.trim() || 'Employee'

    await sendSalarySlipEmail({
      to: parsed.data.to,
      cc: parsed.data.cc || null,
      businessDisplayName,
      replyToEmail,
      subject: parsed.data.subject,
      message: parsed.data.message,
      voucherNumber,
      employeeName,
      netPay: formatAmount(slip.netTotal, parsed.data.locale || 'en'),
      pdfBuffer,
      pdfFilename: `${safePdfFilename(voucherNumber)}.pdf`,
      locale: parsed.data.locale || 'en',
    })

    return jsonOk({ ok: true })
  } catch (err) {
    console.error('[hisabi-pos:salary-slips] email send failed', err)
    return jsonError(500, 'SERVER_ERROR', 'Could not send email')
  }
}
