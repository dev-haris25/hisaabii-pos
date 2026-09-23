'use client'

import { DesktopFirstSyncGate } from '@/components/desktop/desktop-first-sync-gate'

/**
 * @param {{ children: import('react').ReactNode }} props
 */
export function PosDesktopSyncShell({ children }) {
  return <DesktopFirstSyncGate>{children}</DesktopFirstSyncGate>
}
