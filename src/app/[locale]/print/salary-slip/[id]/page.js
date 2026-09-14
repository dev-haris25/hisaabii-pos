import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'

import { getResolvedActiveBusinessProfile } from '@/lib/auth/active-business-profile'
import { getSessionUser } from '@/lib/auth/get-session-user'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { mapSalarySlipToDocumentModel } from '@/lib/hr/salary-slips/map-salary-slip-to-document-model'
import { salarySlipPrintInclude } from '@/lib/hr/salary-slips/salary-slip-print-include'
import { prisma } from '@/lib/prisma'

import { PrintSalarySlipClient } from './print-salary-slip-client'

export default async function Page({ params }) {
  const { locale, id } = await params
  setRequestLocale(locale)

  const session = await getSessionUser()
  if (!session) notFound()

  const profile = await getResolvedActiveBusinessProfile(session.id)
  if (!profile) notFound()

  const slip = await prisma.salarySlip.findFirst({
    where: { id, businessProfileId: profile.id, ...WHERE_NOT_DELETED },
    include: salarySlipPrintInclude,
  })
  if (!slip) notFound()

  const docLocale = locale === 'ar' ? 'ar' : 'en'
  const model = mapSalarySlipToDocumentModel(slip, profile, docLocale)

  return <PrintSalarySlipClient model={model} />
}
