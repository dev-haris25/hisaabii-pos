import { setRequestLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'

import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'

/** Floor lives under POS → Tables tab. */
export default async function TableSessionsPage({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  await requireAdminAppUser()
  redirect(`/${locale}/pos?tab=tables`)
}
