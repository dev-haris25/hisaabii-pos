import { setRequestLocale } from 'next-intl/server'

import { requireKitchenQueuePageUser } from '@/lib/auth/require-kitchen-app-user'

export default async function QueueLayout({ children, params }) {
  const { locale } = await params
  setRequestLocale(locale)
  await requireKitchenQueuePageUser('queue')
  return children
}
