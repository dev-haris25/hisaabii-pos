/**
 * Cloud write paths that stay allowed while the desktop till is offline.
 * Kitchen status + auth/sync housekeeping only — not admin CRUD.
 *
 * @param {string} path auth-client path (e.g. "/orders/abc/status")
 * @param {string} method
 */
export function isOfflineWriteExemptPath(path, method = 'POST') {
  const p = String(path || '')
  const m = String(method || 'POST').toUpperCase()

  if (p === '/login' || p.startsWith('/login?')) return true
  if (p === '/logout' || p.startsWith('/logout?')) return true
  if (p.startsWith('/sync/')) return true
  if (p === '/register' || p.startsWith('/register')) return true
  if (p.startsWith('/otp') || p.startsWith('/password') || p.startsWith('/invite')) {
    return true
  }

  // Kitchen order status (any till, online or offline via cloud when reachable)
  if (
    (m === 'PATCH' || m === 'POST') &&
    (/^\/orders\/[^/]+\/status\/?$/.test(p) ||
      /^\/kitchen-orders\/[^/]+\/status\/?$/.test(p))
  ) {
    return true
  }

  return false
}
