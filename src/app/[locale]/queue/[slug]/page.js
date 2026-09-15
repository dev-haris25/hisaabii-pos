import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { QueueDisplayView } from '@/components/orders/queue-display-view'
import { prisma } from '@/lib/prisma'

export async function generateMetadata({ params }) {
  const { locale, slug } = await params
  setRequestLocale(locale)
  const t = await getTranslations('KitchenQueue')
  const profile = await prisma.businessProfile.findUnique({
    where: { slug: String(slug ?? '') },
    select: { companyNameAr: true, companyNameEn: true },
  })
  const name =
    locale === 'ar'
      ? profile?.companyNameAr
      : profile?.companyNameEn?.trim() || profile?.companyNameAr
  return {
    title: name ? `${name} · ${t('queueMetaTitle')}` : t('queueMetaTitle'),
    robots: { index: false, follow: false },
  }
}

export default async function PublicCustomerQueuePage({ params }) {
  const { locale, slug } = await params
  setRequestLocale(locale)

  const profile = await prisma.businessProfile.findUnique({
    where: { slug: String(slug ?? '') },
    select: {
      companyNameAr: true,
      companyNameEn: true,
      onboardingCompletedAt: true,
    },
  })
  if (!profile?.onboardingCompletedAt) notFound()

  const restaurantName =
    locale === 'ar'
      ? profile.companyNameAr
      : profile.companyNameEn?.trim() || profile.companyNameAr

  return (
    <QueueDisplayView slug={String(slug)} restaurantName={restaurantName} />
  )
}
