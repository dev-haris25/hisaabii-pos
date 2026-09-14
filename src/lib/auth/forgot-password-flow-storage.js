const KEY = 'hisabi:forgot-password-pending-email'

export function setForgotPasswordPendingEmail(email) {
  if (typeof window === 'undefined') return
  const normalized = email.trim().toLowerCase()
  if (normalized) sessionStorage.setItem(KEY, normalized)
}

export function getForgotPasswordPendingEmail() {
  if (typeof window === 'undefined') return ''
  return (sessionStorage.getItem(KEY) || '').trim().toLowerCase()
}

export function clearForgotPasswordPendingEmail() {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(KEY)
}
