'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import { AppLoader } from '@/components/app-loader'
import { OtpVerifyFlow } from '@/components/auth/otp-verify-flow'
import { usePathname, useRouter } from '@/i18n/navigation'
import {
  getForgotPasswordPendingEmail,
  setForgotPasswordPendingEmail,
} from '@/lib/auth/forgot-password-flow-storage'

export function VerifyOtpView() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [email, setEmail] = useState('')
  const [ready, setReady] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect -- hydrate email from query/sessionStorage once */
  useEffect(() => {
    const fromQuery = (searchParams.get('email') || '').trim().toLowerCase()
    if (fromQuery) {
      setForgotPasswordPendingEmail(fromQuery)
      router.replace(pathname)
      setEmail(fromQuery)
      setReady(true)
      return
    }
    setEmail(getForgotPasswordPendingEmail())
    setReady(true)
  }, [searchParams, router, pathname])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-hisabi-background">
        <AppLoader />
      </div>
    )
  }

  return (
    <OtpVerifyFlow mode="forgot" namespace="VerifyOtp" searchEmail={email} />
  )
}
