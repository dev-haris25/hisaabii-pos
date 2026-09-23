'use client'

import { AuthApiError, authGet } from '@/lib/api/auth-client'
import { probeCloudReachable } from '@/lib/desktop/cloud-connectivity'
import {
  getDesktopLocalApiBaseUrl,
  getHisabiDesktop,
} from '@/lib/desktop/hisabi-desktop'
import { getOfflineSessionToken } from '@/lib/desktop/offline-session'

async function localAuthHeaders() {
  const token = await getOfflineSessionToken()
  /** @type {Record<string, string>} */
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

/**
 * @param {string} path
 * @param {RequestInit} [init]
 */
async function localFetch(path, init = {}) {
  const base = await getDesktopLocalApiBaseUrl()
  if (!base) {
    throw new AuthApiError(
      503,
      'LOCAL_API_UNAVAILABLE',
      'Local till API is not available',
    )
  }
  const headers = {
    ...(await localAuthHeaders()),
    ...(init.headers || {}),
  }
  let res
  try {
    res = await fetch(`${base}${path}`, { ...init, headers, cache: 'no-store' })
  } catch {
    throw new AuthApiError(
      503,
      'LOCAL_API_UNAVAILABLE',
      'Could not reach the local till API',
    )
  }
  let data = {}
  try {
    data = await res.json()
  } catch {
    // ignore
  }
  return { res, data }
}

/**
 * @param {Record<string, unknown>} body
 * @returns {Promise<{ invoice: Record<string, unknown> }>}
 */
export async function localPosCheckout(body) {
  const { res, data } = await localFetch('/v1/pos/checkout', {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  })

  if (!res.ok || data.ok === false) {
    const code =
      typeof data.code === 'string'
        ? data.code
        : res.status === 403
          ? 'PRIMARY_TILL_REQUIRED'
          : 'SERVER_ERROR'
    throw new AuthApiError(
      res.status || 500,
      code,
      typeof data.message === 'string' ? data.message : undefined,
      data.shortfalls,
    )
  }

  return { invoice: data.invoice }
}

/**
 * @param {string} invoiceId
 */
export async function fetchLocalInvoice(invoiceId) {
  if (!invoiceId) return null
  try {
    const { res, data } = await localFetch(
      `/v1/pos/invoice/${encodeURIComponent(invoiceId)}`,
    )
    if (!res.ok) return null
    return data.invoice && typeof data.invoice === 'object' ? data.invoice : null
  } catch {
    return null
  }
}

/**
 * @param {string} invoiceId
 * @param {{ status: string, allowNegative?: boolean }} body
 */
export async function localKitchenStatusByInvoice(invoiceId, body) {
  const { res, data } = await localFetch(
    `/v1/orders/${encodeURIComponent(invoiceId)}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify(body ?? {}),
    },
  )
  if (!res.ok || data.ok === false) {
    throw new AuthApiError(
      res.status || 500,
      typeof data.code === 'string' ? data.code : 'SERVER_ERROR',
      typeof data.message === 'string' ? data.message : undefined,
      data.shortfalls,
    )
  }
  return data
}

/**
 * @param {{ view?: string }} [opts]
 */
export async function localKitchenBoard(opts = {}) {
  const view = opts.view === 'display' ? 'display' : 'kitchen'
  const { res, data } = await localFetch(`/v1/orders/board?view=${view}`)
  if (!res.ok || data.ok === false) {
    throw new AuthApiError(
      res.status || 500,
      typeof data.code === 'string' ? data.code : 'SERVER_ERROR',
      typeof data.message === 'string' ? data.message : undefined,
    )
  }
  return data
}

export async function fetchLocalBoundTill() {
  const tillId = await getHisabiDesktop()?.getTillId?.()
  if (!tillId) return null
  try {
    const base = await getDesktopLocalApiBaseUrl()
    if (!base) return null
    const res = await fetch(
      `${base}/v1/pos/till?tillId=${encodeURIComponent(tillId)}`,
      { cache: 'no-store' },
    )
    if (!res.ok) return null
    const data = await res.json()
    return data.till && typeof data.till === 'object' ? data.till : null
  } catch {
    return null
  }
}

/**
 * @param {string} [path]
 */
export async function authGetKitchenBoardPreferOffline(
  path = '/orders/board?view=kitchen',
) {
  try {
    return await authGet(path)
  } catch (err) {
    const online = await probeCloudReachable({ timeoutMs: 2500 })
    if (online) throw err
    const view = path.includes('view=display') ? 'display' : 'kitchen'
    return localKitchenBoard({ view })
  }
}

/**
 * @param {string} queryPath e.g. "/menu/items?page=1&limit=10"
 */
async function localCatalogGet(queryPath) {
  const { res, data } = await localFetch(`/v1${queryPath}`)
  if (!res.ok || data.ok === false) {
    throw new AuthApiError(
      res.status || 500,
      typeof data.code === 'string' ? data.code : 'SERVER_ERROR',
      typeof data.message === 'string' ? data.message : undefined,
    )
  }
  return data
}

/**
 * Menu items list — cloud first, local SQLite when offline.
 * @param {string} [path] auth path including query, default "/menu/items"
 */
export async function authGetMenuItemsPreferOffline(path = '/menu/items') {
  const online = await probeCloudReachable({ timeoutMs: 2500 })
  if (online) {
    try {
      return await authGet(path)
    } catch (err) {
      /* fall through to local */
      void err
    }
  }
  const q = path.includes('?') ? path.slice(path.indexOf('?')) : ''
  return localCatalogGet(`/menu/items${q}`)
}

/**
 * Combined POS menu (categories + items + settings) — cloud first, local when offline.
 * Matches GET /api/auth/pos/menu.
 */
export async function authGetPosMenuPreferOffline() {
  const online = await probeCloudReachable({ timeoutMs: 2500 })
  if (online) {
    try {
      return await authGet('/pos/menu')
    } catch (err) {
      void err
    }
  }
  const { res, data } = await localFetch('/v1/pos/menu')
  if (!res.ok || data.ok === false) {
    throw new AuthApiError(
      res.status || 500,
      typeof data.code === 'string' ? data.code : 'SERVER_ERROR',
      typeof data.message === 'string' ? data.message : undefined,
    )
  }
  return data
}

/**
 * Menu categories — cloud first, local SQLite when offline.
 */
export async function authGetMenuCategoriesPreferOffline(
  path = '/menu/categories',
) {
  const online = await probeCloudReachable({ timeoutMs: 2500 })
  if (online) {
    try {
      return await authGet(path)
    } catch (err) {
      void err
    }
  }
  return localCatalogGet('/menu/categories')
}

/**
 * Stock items list — cloud first, local SQLite when offline.
 * @param {string} [path]
 */
export async function authGetStockItemsPreferOffline(path = '/stock/items') {
  const online = await probeCloudReachable({ timeoutMs: 2500 })
  if (online) {
    try {
      return await authGet(path)
    } catch (err) {
      void err
    }
  }
  const q = path.includes('?') ? path.slice(path.indexOf('?')) : ''
  return localCatalogGet(`/stock/items${q}`)
}
