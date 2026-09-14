'use client'

import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { SalarySlipFormPage } from '@/components/hr/salary-slip-form-page'
import { authGet } from '@/lib/api/auth-client'

/**
 * @param {{ salarySlipId: string, hasBusinessProfile?: boolean }} props
 */
export function EditSalarySlipPageClient({ salarySlipId, hasBusinessProfile }) {
  const t = useTranslations('HR')

  const { data, isPending, isError } = useQuery({
    queryKey: ['hr-salary-slip', salarySlipId],
    queryFn: async () => authGet(`/hr/salary-slips/${salarySlipId}`),
    enabled: Boolean(salarySlipId),
  })

  if (isPending) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-hisabi-primary" aria-hidden />
      </div>
    )
  }

  if (isError || !data?.item) {
    return (
      <div className="text-hisabi-on-surface-variant mx-auto max-w-hisabi-container py-24 text-center">
        {t('loadError')}
      </div>
    )
  }

  return (
    <SalarySlipFormPage
      mode="edit"
      salarySlip={data.item}
      salarySlipId={salarySlipId}
      hasBusinessProfile={hasBusinessProfile}
    />
  )
}
