import { toast } from 'sonner'

import { AuthApiError } from '@/lib/api/auth-client'

/** @param {unknown} err */
function isLikelyNetworkError(err) {
  if (err instanceof TypeError) {
    const m = String(err?.message ?? '')
    if (/fetch|network|Failed to fetch|Load failed|NETWORK/i.test(m)) {
      return true
    }
  }
  return false
}

/**
 * Shows a toast for failed `/api/auth/*` calls.
 *
 * @param {(key: string) => string} t translation fn with optional `.has`
 * @param {unknown} err
 */
export function toastAuthApiError(t, err) {
  const has = typeof t?.has === 'function' ? (k) => t.has(k) : () => false

  if (err instanceof AuthApiError) {
    const msg = typeof err.message === 'string' ? err.message.trim() : ''
    if (err.code && has(err.code)) {
      toast.error(t(err.code))
      return
    }
    if (err.code && has(`apiErrors.${err.code}`)) {
      toast.error(t(`apiErrors.${err.code}`))
      return
    }
    if (msg && msg !== err.code && msg !== String(err.status) && !/^HTTP_\d+$/i.test(msg)) {
      toast.error(msg)
      return
    }
    if (err.status === 401 && has('apiErrors.UNAUTHORIZED')) {
      toast.error(t('apiErrors.UNAUTHORIZED'))
      return
    }
    if (err.status === 403 && has('apiErrors.FORBIDDEN')) {
      toast.error(t('apiErrors.FORBIDDEN'))
      return
    }
    if (err.status === 404 && has('apiErrors.NOT_FOUND')) {
      toast.error(t('apiErrors.NOT_FOUND'))
      return
    }
    if (err.status >= 500 && err.status < 600 && has('apiErrors.SERVER_ERROR')) {
      toast.error(t('apiErrors.SERVER_ERROR'))
      return
    }
    if (err.status >= 400 && err.status < 500 && has('apiErrors.requestFailed')) {
      toast.error(t('apiErrors.requestFailed'))
      return
    }
  }
  if (isLikelyNetworkError(err) && has('apiErrors.network')) {
    toast.error(t('apiErrors.network'))
    return
  }
  if (has('apiErrors.generic')) {
    toast.error(t('apiErrors.generic'))
    return
  }
  toast.error('Something went wrong')
}
