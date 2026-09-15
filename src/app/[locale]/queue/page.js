import { setRequestLocale } from 'next-intl/server'

import { redirect } from '@/i18n/navigation'
import { requireOwnerAdminCustomerQueueShortcut } from '@/lib/auth/require-kitchen-app-user'
import { normalizeCustomerQueueLocale } from '@/lib/orders/customer-queue-url'
import { prisma } from '@/lib/prisma'

export default async function QueueShortcutPage({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const user = await requireOwnerAdminCustomerQueueShortcut()

  const profile = user.businessProfileId
    ? await prisma.businessProfile.findUnique({
        where: { id: user.businessProfileId },
        select: { slug: true, customerQueueLocale: true },
      })
    : null

  if (!profile?.slug) {
    redirect('/')
  }

  redirect({
    href: `/queue/${profile.slug}`,
    locale: normalizeCustomerQueueLocale(profile.customerQueueLocale),
  })
}
