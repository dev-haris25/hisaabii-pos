import { createMongoAbility } from '@casl/ability'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'

import { OfferFormView } from '../../offer-form-view'
import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'
import { offerWithItemsInclude } from '@/lib/offers/load-active-offers'
import { mapOfferAdminJson } from '@/lib/offers/map-offer-json'
import { prisma } from '@/lib/prisma'
import { hasFullAccess } from '@/lib/rbac/ability-utils'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('Offers')
  return { title: t('formEditMetaTitle') }
}

export default async function EditOfferPage({ params }) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const user = await requireAdminAppUser()

  const ability = createMongoAbility(user.abilityRules ?? [])
  if (!hasFullAccess(ability) && !ability.can('update', 'Offer')) {
    redirect(`/${locale}/offers`)
  }

  const row = await prisma.offer.findFirst({
    where: {
      id,
      businessProfileId: user.businessProfileId,
      deletedAt: null,
    },
    include: offerWithItemsInclude,
  })
  if (!row) notFound()

  return <OfferFormView mode="edit" offer={mapOfferAdminJson(row)} />
}
