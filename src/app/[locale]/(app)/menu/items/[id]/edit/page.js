import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { MenuItemFormView } from '../../menu-item-form-view'
import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'
import { prisma } from '@/lib/prisma'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('Menu')
  return { title: t('itemEditTitle') }
}

export default async function EditMenuItemPage({ params }) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const user = await requireAdminAppUser()

  const exists = await prisma.menuItem.findFirst({
    where: { id, businessProfileId: user.businessProfileId },
    select: { id: true },
  })
  if (!exists) notFound()

  return <MenuItemFormView mode="edit" itemId={id} />
}
