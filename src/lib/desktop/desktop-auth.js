'use client'

import { authPost } from '@/lib/api/auth-client'

/**
 * @param {{ email: string, password: string, remember?: boolean }} body
 */
export async function loginOnlineOrOffline(body) {
  return authPost('/login', body)
}

/** Clears the cloud session (best-effort if the network fails). */
export async function logoutOnlineOrOffline() {
  try {
    await authPost('/logout')
  } catch {
    /* ignore */
  }
}
