'use client'

import { WifiOff } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useCloudConnectivity } from '@/hooks/use-cloud-connectivity'
import { useIsHisabiDesktop } from '@/hooks/use-is-hisabi-desktop'
import { cn } from '@/lib/utils'

/**
 * Small header pill when the Electron till is offline mid-session.
 * @param {{ className?: string }} [props]
 */
export function DesktopOfflineBadge({ className }) {
  const t = useTranslations('AppShell')
  const desktop = useIsHisabiDesktop()
  const { cloudOnline, checking } = useCloudConnectivity()

  if (!desktop || checking || cloudOnline) return null

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full bg-hisabi-secondary-container px-2 py-0.5 text-[11px] font-bold leading-4 text-hisabi-secondary',
        className,
      )}
      role="status"
      title={t('desktopOfflineBadge')}
    >
      <WifiOff className="size-3.5 shrink-0" aria-hidden />
      <span className="hidden sm:inline">{t('desktopOfflineBadge')}</span>
    </span>
  )
}
