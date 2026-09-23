import { setRequestLocale } from 'next-intl/server'

import { PosDesktopSyncShell } from '@/components/desktop/pos-desktop-sync-shell'
import { requirePosAppUser } from '@/lib/auth/require-pos-app-user'

/**
 * Standalone POS (no AdminAppShell). Back to the admin app via the POS header.
 */
export default async function PosLayout({ children, params }) {
  const { locale } = await params
  setRequestLocale(locale)
  await requirePosAppUser()
  return <PosDesktopSyncShell>{children}</PosDesktopSyncShell>
}
