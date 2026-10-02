import { Suspense } from 'react'
import { createMongoAbility } from '@casl/ability'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'

import { TableSessionDetailView } from './table-session-detail-view'
import { AppLoader } from '@/components/app-loader'
import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'
import { hasFullAccess } from '@/lib/rbac/ability-utils'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('TableSessions')
  return { title: t('detailMetaTitle') }
}

export default async function TableSessionDetailPage({ params }) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const user = await requireAdminAppUser()

  const ability = createMongoAbility(user.abilityRules ?? [])
  if (!hasFullAccess(ability) && !ability.can('read', 'TableSession')) {
    redirect(`/${locale}`)
  }

  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-hisabi-xxl">
          <AppLoader />
        </div>
      }
    >
      <TableSessionDetailView sessionId={id} />
    </Suspense>
  )
}
