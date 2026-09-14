import { hasLocale } from 'next-intl'

import { jsonError } from '@/lib/api/json-response'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import {
  generateSalarySlipPdfBuffer,
  safePdfFilename,
} from '@/lib/hr/salary-slips/generate-salary-slip-pdf'
import { routing } from '@/i18n/routing'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

/** @param {import('next/server').NextRequest} request @param {{ params: Promise<{ id: string }> }} ctx */
export async function GET(request, ctx) {
  const auth = await authorizeBusinessRequest(request)
  if (auth.error) return auth.error
  const { profile } = auth
  const { id } = await ctx.params
  if (!id) return jsonError(400, 'VALIDATION_ERROR', 'Missing id')

  const slip = await prisma.salarySlip.findFirst({
    where: { id, businessProfileId: profile.id, ...WHERE_NOT_DELETED },
    select: { voucherNumber: true },
  })
  if (!slip) return jsonError(404, 'NOT_FOUND', 'Salary slip not found')

  const requestedLocale = request.nextUrl.searchParams.get('locale')
  const locale = hasLocale(routing.locales, requestedLocale)
    ? requestedLocale
    : routing.defaultLocale

  const cookieHeader = request.headers.get('cookie') ?? ''
  const origin =
    process.env.NODE_ENV === 'production'
      ? process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
      : new URL(request.url).origin

  try {
    const pdfBuffer = await generateSalarySlipPdfBuffer({
      salarySlipId: id,
      locale,
      origin,
      cookieHeader,
    })

    const filename = safePdfFilename(slip.voucherNumber || 'salary-slip')

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}.pdf"`,
      },
    })
  } catch (err) {
    console.error('[hisabi-pos:salary-slips] PDF generation failed', err)
    return jsonError(500, 'SERVER_ERROR', 'Could not generate PDF')
  }
}
