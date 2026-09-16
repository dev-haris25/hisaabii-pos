'use client'

/**
 * True when the page runs inside the Hisabi Electron till app.
 */
export function isHisabiDesktop() {
  if (typeof window === 'undefined') return false
  return Boolean(window.hisabiDesktop?.isDesktop)
}

export function getHisabiDesktop() {
  if (typeof window === 'undefined') return null
  return window.hisabiDesktop ?? null
}
