import { getTranslations, setRequestLocale } from 'next-intl/server'

import { InviteAcceptPageClient } from './invite-accept-page-client'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('Invite')
  return { title: t('metaAcceptInvite') }
}

export default async function Page({ params }) {
  await params
  return <InviteAcceptPageClient />
}
