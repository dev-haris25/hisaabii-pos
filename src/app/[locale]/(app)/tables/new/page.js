import { setRequestLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'

import { requireAdminAppUser } from '@/lib/auth/require-admin-app-user'

/** Create flow lives in AddTableSheet on the tables list. */
export default async function NewTablePage({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  await requireAdminAppUser()
  redirect(`/${locale}/tables`)
}
