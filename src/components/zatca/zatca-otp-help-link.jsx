'use client'

import { CircleHelp } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { FatooraOtpHelpModal } from '@/components/zatca/fatoora-otp-help-modal'
import { cn } from '@/lib/utils'

/**
 * Opens in-app Fatoora OTP instructions (modal) with a link to the official portal.
 *
 * @param {{ className?: string }} [props]
 */
export function ZatcaOtpHelpLink({ className }) {
  const t = useTranslations('ZatcaOnboarding')
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'type-label-md text-hisabi-teal hover:text-hisabi-teal-container group inline-flex cursor-pointer items-center gap-hisabi-xs font-semibold underline decoration-hisabi-teal-container/40 underline-offset-4 transition-colors hover:decoration-hisabi-teal',
          className,
        )}
      >
        <CircleHelp className="size-[18px] shrink-0" aria-hidden />
        {t('helpLink')}
      </button>
      <FatooraOtpHelpModal open={open} onOpenChange={setOpen} />
    </>
  )
}
