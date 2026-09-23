'use client'

import { useTranslations } from 'next-intl'

import { HisabiStatusModal } from '@/components/hisabi-status-modal'

/**
 * Plan copy: Internet required (offline CRUD blocked).
 *
 * @param {{
 *   open: boolean
 *   onOpenChange: (open: boolean) => void
 * }} props
 */
export function InternetRequiredModal({ open, onOpenChange }) {
  const t = useTranslations('Offline')

  return (
    <HisabiStatusModal
      open={open}
      onOpenChange={onOpenChange}
      variant="warning"
      title={t('internetRequiredTitle')}
      description={t('internetRequiredBody')}
      primaryLabel={t('internetRequiredOk')}
      onPrimary={() => onOpenChange(false)}
    />
  )
}
