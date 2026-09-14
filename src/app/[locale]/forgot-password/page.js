import { getTranslations, setRequestLocale } from 'next-intl/server'

import { ForgotPasswordView } from './forgot-password-view'

export async function generateMetadata() {
  const t = await getTranslations('ResetPassword')
  return {
    title: t('metaTitle'),
  }
}

export default async function ForgotPasswordPage({ params }) {
  const { locale } = await params
  setRequestLocale(locale)

  return <ForgotPasswordView />
}
