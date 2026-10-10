'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { AppLoader } from '@/components/app-loader'
import { EmployeeFormPage } from '@/components/hr/employee-form-page'
import { authGet } from '@/lib/api/auth-client'

/**
 * @param {{ employeeId: string, hasBusinessProfile?: boolean }} props
 */
export function EditEmployeePageClient({ employeeId, hasBusinessProfile }) {
  const t = useTranslations('HR')

  const { data, isPending, isError } = useQuery({
    queryKey: ['hr-employee', employeeId],
    queryFn: async () => authGet(`/hr/employees/${employeeId}`),
    enabled: Boolean(employeeId),
  })

  if (isPending) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <AppLoader size="lg" />
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
    <EmployeeFormPage
      mode="edit"
      employee={data.item}
      employeeId={employeeId}
      hasBusinessProfile={hasBusinessProfile}
    />
  )
}
