'use client'

/**
 * True when the page runs inside the Hisabi Electron till app.
 * Safe in event handlers, effects, and async code.
 * For React render / first paint, use `useIsHisabiDesktop` instead so SSR
 * HTML matches the client hydrate (Electron would otherwise mismatch).
 */
export function isHisabiDesktop() {
  if (typeof window === 'undefined') return false
  return Boolean(window.hisabiDesktop?.isDesktop)
}

export function getHisabiDesktop() {
  if (typeof window === 'undefined') return null
  return window.hisabiDesktop ?? null
}
