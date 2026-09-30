import { Suspense } from 'react'
import { createMongoAbility } from '@casl/ability'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'

import { CouponDetailView } from '../coupon-detail-view'
import { AppLoader } from '@/components/app-loader'
import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'
import {
  couponDetailInclude,
  mapCouponToJson,
} from '@/lib/coupons/map-coupon-json'
import { queryCouponCodesPage } from '@/lib/coupons/query-coupon-codes'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { prisma } from '@/lib/prisma'
import { hasFullAccess } from '@/lib/rbac/ability-utils'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('Coupons')
  return { title: t('detailMetaTitle') }
}

export default async function CouponDetailPage({ params, searchParams }) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const user = await requireAdminAppUser()

  const ability = createMongoAbility(user.abilityRules ?? [])
  if (!hasFullAccess(ability) && !ability.can('read', 'Coupon')) {
    redirect(`/${locale}`)
  }

  const row = await prisma.coupon.findFirst({
    where: {
      id,
      businessProfileId: user.businessProfileId,
      ...WHERE_NOT_DELETED,
    },
    include: {
      itemRules: couponDetailInclude.itemRules,
      _count: couponDetailInclude._count,
    },
  })
  if (!row) notFound()

  const coupon = mapCouponToJson(row)

  const sp = searchParams instanceof Promise ? await searchParams : searchParams
  const urlParams = new URLSearchParams()
  for (const [k, v] of Object.entries(sp ?? {})) {
    if (typeof v === 'string') urlParams.set(k, v)
  }

  const codesPage = urlParams.get('codesPage') ?? '1'
  const codesLimit = urlParams.get('codesLimit') ?? '10'
  const codesSearch = (urlParams.get('codesSearch') ?? '').trim()

  /** @type {Awaited<ReturnType<typeof queryCouponCodesPage>> | null} */
  let codesResult = null

  if (row.codeType === 'UNIQUE_BATCH') {
    const codesParams = new URLSearchParams()
    codesParams.set('page', codesPage)
    codesParams.set('limit', codesLimit)
    if (codesSearch) codesParams.set('search', codesSearch)

    codesResult = await queryCouponCodesPage({
      db: prisma,
      couponId: id,
      businessProfileId: user.businessProfileId,
      searchParams: codesParams,
    })
  }

  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-hisabi-xxl">
          <AppLoader />
        </div>
      }
    >
      <CouponDetailView
        coupon={coupon}
        codes={codesResult?.codes ?? null}
        codesPagination={
          codesResult?.pagination ?? {
            page: 1,
            limit: 10,
            total: 0,
            totalPages: 1,
          }
        }
        codesFilters={{
          codesSearch,
          codesPage: Number.parseInt(codesPage, 10) || 1,
          codesLimit: Number.parseInt(codesLimit, 10) || 10,
        }}
      />
    </Suspense>
  )
}
