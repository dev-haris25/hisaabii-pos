import { Suspense } from 'react'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'

import { AppLoader } from '@/components/app-loader'
import { getSessionUser } from '@/lib/auth/get-session-user'
import { getPostAuthLandingPath } from '@/lib/auth/post-auth-landing-path'
import { parseSafeNextPath } from '@/lib/auth/safe-next-path'

import { BusinessProfileView } from './business-profile-view'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('BusinessProfile')
  return {
    title: t('metaTitle'),
  }
}

export default async function BusinessProfilePage({ params, searchParams }) {
  const { locale } = await params
  setRequestLocale(locale)

  const sp = searchParams instanceof Promise ? await searchParams : searchParams
  const fromZatca = sp?.from === 'zatca'
  const nextPath = parseSafeNextPath(typeof sp?.next === 'string' ? sp.next : null)

  const user = await getSessionUser()
  if (!user) {
    redirect(
      nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : '/login',
    )
  }

  // Same as Hisabi: allow returning from ZATCA to edit the restaurant profile
  // (prefilled). Otherwise leave once first-run onboarding is done.
  if (!user.needsBusinessProfileOnboarding && !fromZatca) {
    redirect(getPostAuthLandingPath(user, nextPath))
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-hisabi-background">
          <AppLoader />
        </div>
      }
    >
      <BusinessProfileView />
    </Suspense>
  )
}
