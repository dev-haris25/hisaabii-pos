import { Suspense } from 'react'
import { createMongoAbility } from '@casl/ability'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'

import { CouponsListView } from './coupons-list-view'
import { AppLoader } from '@/components/app-loader'
import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'
import {
  couponListInclude,
  mapCouponToJson,
} from '@/lib/coupons/map-coupon-json'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import {
  buildPaginationMeta,
  parseListPagination,
} from '@/lib/list-views/parse-list-pagination'
import { prisma } from '@/lib/prisma'
import { hasFullAccess } from '@/lib/rbac/ability-utils'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('Coupons')
  return { title: t('metaTitle') }
}

export default async function CouponsPage({ params, searchParams }) {
  const { locale } = await params
  setRequestLocale(locale)
  const user = await requireAdminAppUser()

  const ability = createMongoAbility(user.abilityRules ?? [])
  if (!hasFullAccess(ability) && !ability.can('read', 'Coupon')) {
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
  const activeRaw = urlParams.get('active') ?? 'all'
  const activeFilter =
    activeRaw === 'true' || activeRaw === 'false' ? activeRaw : 'all'
  const codeTypeRaw = (urlParams.get('codeType') ?? '').trim()
  const codeType =
    codeTypeRaw === 'SHARED' || codeTypeRaw === 'UNIQUE_BATCH'
      ? codeTypeRaw
      : ''
  const discountKindRaw = (urlParams.get('discountKind') ?? '').trim()
  const discountKind =
    discountKindRaw === 'PERCENTAGE' ||
    discountKindRaw === 'FIXED_AMOUNT' ||
    discountKindRaw === 'BOGO' ||
    discountKindRaw === 'COMBO'
      ? discountKindRaw
      : ''

  /** @type {Record<string, unknown>} */
  const where = {
    businessProfileId: user.businessProfileId,
    ...WHERE_NOT_DELETED,
  }
  if (activeFilter === 'true') where.active = true
  if (activeFilter === 'false') where.active = false
  if (codeType) where.codeType = codeType
  if (discountKind) where.discountKind = discountKind
  if (search) {
    where.OR = [
      { nameAr: { contains: search, mode: 'insensitive' } },
      { nameEn: { contains: search, mode: 'insensitive' } },
      { code: { contains: search, mode: 'insensitive' } },
      {
        codes: {
          some: { code: { contains: search, mode: 'insensitive' } },
        },
      },
    ]
  }

  const { page, limit, skip } = parseListPagination(urlParams, {
    defaultLimit: 10,
  })

  const [total, rows] = await Promise.all([
    prisma.coupon.count({ where }),
    prisma.coupon.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { nameAr: 'asc' }],
      skip,
      take: limit,
      include: couponListInclude,
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
      <CouponsListView
        coupons={rows.map((row) => mapCouponToJson(row))}
        pagination={buildPaginationMeta(page, limit, total)}
        filters={{
          search,
          active: activeFilter,
          codeType,
          discountKind,
        }}
      />
    </Suspense>
  )
}
