import { createMongoAbility } from '@casl/ability'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'

import { CouponFormView } from '../../coupon-form-view'
import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'
import {
  couponDetailInclude,
  mapCouponToJson,
} from '@/lib/coupons/map-coupon-json'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { prisma } from '@/lib/prisma'
import { hasFullAccess } from '@/lib/rbac/ability-utils'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('Coupons')
  return { title: t('formEditMetaTitle') }
}

export default async function EditCouponPage({ params }) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const user = await requireAdminAppUser()

  const ability = createMongoAbility(user.abilityRules ?? [])
  if (!hasFullAccess(ability) && !ability.can('update', 'Coupon')) {
    redirect(`/${locale}/coupons`)
  }

  const row = await prisma.coupon.findFirst({
    where: {
      id,
      businessProfileId: user.businessProfileId,
      ...WHERE_NOT_DELETED,
    },
    include: couponDetailInclude,
  })
  if (!row) notFound()

  return <CouponFormView mode="edit" coupon={mapCouponToJson(row)} />
}
