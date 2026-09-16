'use client'

import { getHisabiDesktop } from '@/lib/desktop/hisabi-desktop'

/**
 * @param {Record<string, unknown> | null | undefined} till
 * @param {string} text
 */
export function writeTillCustomerDisplay(till, text) {
  const desktop = getHisabiDesktop()
  if (!desktop?.writeCustomerDisplay) return Promise.resolve(false)
  if (!till || till.displayEnabled !== true) return Promise.resolve(false)
  const port = String(till.displayPort ?? '').trim()
  if (!port) return Promise.resolve(false)
  return desktop.writeCustomerDisplay({
    port,
    baud: Number(till.displayBaud) || 9600,
    text: String(text ?? '0.00'),
  })
}

/**
 * @param {Record<string, unknown> | null | undefined} till
 */
export function openTillCashDrawer(till) {
  const desktop = getHisabiDesktop()
  if (!desktop?.openCashDrawer) return Promise.resolve(false)
  if (!till || till.drawerEnabled !== true) return Promise.resolve(false)
  const port = String(till.drawerPort ?? '').trim()
  if (!port) return Promise.resolve(false)
  return desktop.openCashDrawer({
    port,
    baud: 9600,
  })
}
