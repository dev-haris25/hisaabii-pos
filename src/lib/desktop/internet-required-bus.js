'use client'

export const INTERNET_REQUIRED_EVENT = 'hisabi:internet-required'

/** Ask the shell to show the Internet required modal. */
export function requestInternetRequiredModal() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(INTERNET_REQUIRED_EVENT))
}
