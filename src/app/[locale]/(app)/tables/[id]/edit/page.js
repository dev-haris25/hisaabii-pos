import { createMongoAbility } from '@casl/ability'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'

import { TableFormView } from '../../table-form-view'
import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { mapTableToJson } from '@/lib/e-waiter/map-table-json'
import { prisma } from '@/lib/prisma'
import { hasFullAccess } from '@/lib/rbac/ability-utils'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('Tables')
  return { title: t('formEditMetaTitle') }
}

export default async function EditTablePage({ params }) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const user = await requireAdminAppUser()

  const ability = createMongoAbility(user.abilityRules ?? [])
  if (!hasFullAccess(ability) && !ability.can('update', 'ETable')) {
    redirect(`/${locale}/tables`)
  }

  const row = await prisma.table.findFirst({
    where: {
      id,
      businessProfileId: user.businessProfileId,
      ...WHERE_NOT_DELETED,
    },
  })
  if (!row) notFound()

  return <TableFormView mode="edit" table={mapTableToJson(row)} />
}
