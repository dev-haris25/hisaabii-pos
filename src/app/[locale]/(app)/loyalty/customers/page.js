import { Suspense } from 'react'
import { createMongoAbility } from '@casl/ability'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'

import { CustomersListView } from '../customers-list-view'
import { AppLoader } from '@/components/app-loader'
import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import {
  buildPaginationMeta,
  parseListPagination,
} from '@/lib/list-views/parse-list-pagination'
import { mapLoyaltyAccountToJson } from '@/lib/loyalty/map-loyalty-account-json'
import { normalizeLoyaltyPhone } from '@/lib/loyalty/normalize-loyalty-phone'
import { prisma } from '@/lib/prisma'
import { hasFullAccess } from '@/lib/rbac/ability-utils'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('Loyalty')
  return { title: t('customersMetaTitle') }
}

/**
 * @param {string} searchRaw
 * @returns {Record<string, unknown> | null}
 */
function phoneSearchWhere(searchRaw) {
  const trimmed = searchRaw.trim()
  if (!trimmed) return null

  const normalized = normalizeLoyaltyPhone(trimmed)
  if (normalized.valid) {
    return { phone: normalized.normalized }
  }

  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return null
  return { phone: { contains: digits } }
}

/**
 * @param {{
 *   params: Promise<{ locale: string }>
 *   searchParams: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>
 * }} props
 */
export default async function LoyaltyCustomersPage({ params, searchParams }) {
  const { locale } = await params
  setRequestLocale(locale)
  const user = await requireAdminAppUser()

  const ability = createMongoAbility(user.abilityRules ?? [])
  if (!hasFullAccess(ability) && !ability.can('read', 'Loyalty')) {
    redirect(`/${locale}`)
  }

  const sp = searchParams instanceof Promise ? await searchParams : searchParams
  const urlParams = new URLSearchParams()
  for (const [k, v] of Object.entries(sp ?? {})) {
    if (typeof v === 'string') urlParams.set(k, v)
  }
  if (!urlParams.has('page')) urlParams.set('page', '1')
  if (!urlParams.has('limit')) urlParams.set('limit', '10')

  const search = (urlParams.get('search') ?? '').trim()

  /** @type {Record<string, unknown>} */
  const where = {
    businessProfileId: user.businessProfileId,
    ...WHERE_NOT_DELETED,
  }
  const phoneFilter = phoneSearchWhere(search)
  if (phoneFilter) Object.assign(where, phoneFilter)

  const { page, limit, skip } = parseListPagination(urlParams, {
    defaultLimit: 10,
  })

  const [total, rows] = await Promise.all([
    prisma.loyaltyAccount.count({ where }),
    prisma.loyaltyAccount.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { phone: 'asc' }],
      skip,
      take: limit,
    }),
  ])

  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-hisabi-xxl">
          <AppLoader />
        </div>
      }
    >
      <CustomersListView
        customers={rows.map(mapLoyaltyAccountToJson)}
        pagination={buildPaginationMeta(page, limit, total)}
        filters={{ search }}
      />
    </Suspense>
  )
}
