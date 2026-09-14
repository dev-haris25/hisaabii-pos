'use client'

import { HisabiSpinner } from '@/components/hisabi-spinner'

/** Spinner for auth CTAs; inherits `color` from the parent button. */
export function AuthButtonSpinner() {
  return <HisabiSpinner size="button" className="text-current" />
}
