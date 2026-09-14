import { Suspense } from 'react'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'

import { AppLoader } from '@/components/app-loader'
import { getPostAuthLandingPath } from '@/lib/auth/post-auth-landing-path'
import { parseSafeNextPath } from '@/lib/auth/safe-next-path'
import { getSessionUser } from '@/lib/auth/get-session-user'

import { ZatcaOnboardingView } from './zatca-onboarding-view'

export async function generateMetadata({ params }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('ZatcaOnboarding')
  return {
    title: t('metaTitle'),
  }
}

export default async function ZatcaOnboardingPage({ params, searchParams }) {
  const { locale } = await params
  setRequestLocale(locale)

  const sp = await searchParams
  const nextPath = parseSafeNextPath(typeof sp?.next === 'string' ? sp.next : null)

  const user = await getSessionUser()
  if (!user) {
    redirect(
      nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : '/login',
    )
  }

  if (user.needsBusinessProfileOnboarding) {
    redirect(
      nextPath
        ? `/business-profile?next=${encodeURIComponent(nextPath)}`
        : '/business-profile',
    )
  }

  // Same as Hisabi: restaurant profile required before ZATCA OTP.
  if (!user.hasBusinessProfile) {
    redirect(getPostAuthLandingPath(user, nextPath))
  }

  return (
    <Suspense
      fallback={
        <div className="type-body-md text-hisabi-on-surface flex min-h-dvh flex-col items-center justify-center bg-hisabi-background">
          <AppLoader />
        </div>
      }
    >
      <ZatcaOnboardingView />
    </Suspense>
  )
}
