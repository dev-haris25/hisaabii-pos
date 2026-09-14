import { Suspense } from 'react'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { AppLoader } from '@/components/app-loader'

import { ResetPasswordFormView } from './reset-password-form-view'

export async function generateMetadata() {
  const t = await getTranslations('PasswordReset')
  return {
    title: t('metaTitle'),
  }
}

export default async function ForgotPasswordResetPage({ params }) {
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
      <ResetPasswordFormView />
    </Suspense>
  )
}
