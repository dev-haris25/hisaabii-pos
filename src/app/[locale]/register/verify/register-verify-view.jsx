'use client'

import { useSearchParams } from 'next/navigation'

import { parseSafeNextPath } from '@/lib/auth/safe-next-path'

import { OtpVerifyFlow } from '@/components/auth/otp-verify-flow'

export function RegisterVerifyView() {
  const searchParams = useSearchParams()
  const email = searchParams.get('email') || ''
  const nextPath = parseSafeNextPath(searchParams.get('next'))
  return (
    <OtpVerifyFlow
      mode="register"
      namespace="RegisterVerify"
      searchEmail={email}
      nextPath={nextPath}
    />
  )
}
