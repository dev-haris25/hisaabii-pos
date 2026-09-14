import { Suspense } from 'react'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { AppLoader } from '@/components/app-loader'

import { VerifyOtpView } from './verify-otp-view'

export async function generateMetadata() {
  const t = await getTranslations('VerifyOtp')
  return {
    title: t('metaTitle'),
  }
}

export default async function VerifyOtpPage({ params }) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-hisabi-background">
          <AppLoader />
        </div>
      }
    >
      <VerifyOtpView />
    </Suspense>
  )
}
