import { getTranslations, setRequestLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'

import { getPostAuthLandingPath } from '@/lib/auth/post-auth-landing-path'
import { getSessionUser } from '@/lib/auth/get-session-user'
import { parseSafeNextPath } from '@/lib/auth/safe-next-path'

import { RegisterView } from './register-view'

export async function generateMetadata() {
  const t = await getTranslations('Register')
  return {
    title: t('metaTitle'),
  }
}

export default async function RegisterPage({ params, searchParams }) {
  const { locale } = await params
  setRequestLocale(locale)

  const sp = await searchParams
  const nextPath = parseSafeNextPath(typeof sp?.next === 'string' ? sp.next : null)

  const user = await getSessionUser()
  if (user) {
    redirect(getPostAuthLandingPath(user, nextPath))
  }

  return <RegisterView nextPath={nextPath} />
}
