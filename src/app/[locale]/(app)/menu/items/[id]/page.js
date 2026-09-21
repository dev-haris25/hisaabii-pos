import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { MenuItemDetailView } from '../menu-item-detail-view'
import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'
import { prisma } from '@/lib/prisma'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('Menu')
  return { title: t('metaItemDetailTitle') }
}

export default async function MenuItemDetailPage({ params }) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const user = await requireAdminAppUser()

  const exists = await prisma.menuItem.findFirst({
    where: { id, businessProfileId: user.businessProfileId },
    select: { id: true },
  })
  if (!exists) notFound()

  return <MenuItemDetailView itemId={id} />
}
