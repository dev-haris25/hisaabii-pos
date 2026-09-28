const http = require('node:http')
const { getLocalStatus } = require('../db/open-db.cjs')
const {
  localLogin,
  localMe,
  localLogout,
  upsertLocalUserFromCloud,
} = require('../auth/local-login.cjs')
const { getLocalTillPrimaryStatus } = require('./till-primary.cjs')
const { localCheckout, getLocalInvoiceForPrint } = require('../pos/local-checkout.cjs')
const { updateKitchenStatus, listLocalKitchenBoard } = require('../pos/local-kitchen-status.cjs')
const {
  listLocalMenuItems,
  listLocalMenuCategories,
  listLocalStockItems,
  listLocalPosMenu,
} = require('../catalog/local-catalog-read.cjs')
const {
  getOfflineCheckoutUnlockStatus,
  unlockOfflineCheckout,
  clearOfflineCheckoutUnlock,
} = require('./offline-unlock.cjs')
const {
  listLocalInvoices,
  getLocalInvoiceDetail,
} = require('./local-invoices-read.cjs')

const DEFAULT_PORT = 3911
const HOST = '127.0.0.1'

/**
 * @param {import('node:http').IncomingMessage} req
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

/**
 * @param {import('node:http').IncomingMessage} req
 */
function bearerToken(req) {
  const h = req.headers.authorization
  if (typeof h === 'string' && h.toLowerCase().startsWith('bearer ')) {
    return h.slice(7).trim()
  }
  return null
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {unknown} body
 * @param {number} [status]
 */
function sendJson(res, body, status = 200) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  })
  res.end(payload)
}

/**
 * @returns {Promise<{ server: import('node:http').Server, port: number, baseUrl: string }>}
 */
function startLocalApi(preferredPort = DEFAULT_PORT) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || '/', `http://${HOST}`)
        const path = url.pathname.replace(/\/+$/, '') || '/'

        if (req.method === 'GET' && (path === '/health' || path === '/v1/health')) {
          const status = getLocalStatus()
          sendJson(res, {
            ok: true,
            service: 'hisabi-pos-local-api',
            offlineReady: status.offlineReady,
            schemaVersion: status.schemaVersion,
            latestSchemaVersion: status.latestSchemaVersion,
            pendingOutboxCount: status.pendingOutboxCount,
            businessProfileId: status.businessProfileId,
          })
          return
        }

        if (req.method === 'GET' && path === '/v1/sync-state') {
          sendJson(res, { ok: true, syncState: getLocalStatus() })
          return
        }

        if (req.method === 'POST' && path === '/v1/auth/login') {
          let body
          try {
            body = await readJsonBody(req)
          } catch {
            sendJson(res, { ok: false, code: 'INVALID_JSON', message: 'Invalid JSON' }, 400)
            return
          }
          const result = localLogin({
            email: body.email,
            password: body.password,
            remember: Boolean(body.remember),
          })
          if (!result.ok) {
            sendJson(
              res,
              { ok: false, code: result.code, message: result.message },
              result.status || 400,
            )
            return
          }
          sendJson(res, {
            ok: true,
            user: result.user,
            token: result.token,
            offline: true,
          })
          return
        }

        if (req.method === 'GET' && path === '/v1/auth/me') {
          const result = localMe(bearerToken(req))
          if (!result.ok) {
            sendJson(
              res,
              { ok: false, code: result.code, message: result.message },
              result.status || 401,
            )
            return
          }
          sendJson(res, { ok: true, user: result.user })
          return
        }

        if (req.method === 'POST' && path === '/v1/auth/logout') {
          localLogout(bearerToken(req))
          sendJson(res, { ok: true })
          return
        }

        if (req.method === 'POST' && path === '/v1/auth/upsert-user') {
          let body
          try {
            body = await readJsonBody(req)
          } catch {
            sendJson(res, { ok: false, code: 'INVALID_JSON', message: 'Invalid JSON' }, 400)
            return
          }
          sendJson(res, upsertLocalUserFromCloud(body.user || body))
          return
        }

        if (req.method === 'GET' && path === '/v1/pos/till-primary') {
          const tillId = url.searchParams.get('tillId')
          const info = getLocalTillPrimaryStatus(tillId)
          sendJson(res, { ok: true, ...info })
          return
        }

        if (req.method === 'GET' && path === '/v1/pos/offline-unlock') {
          sendJson(res, { ok: true, ...getOfflineCheckoutUnlockStatus() })
          return
        }

        if (req.method === 'POST' && path === '/v1/pos/offline-unlock') {
          const me = localMe(bearerToken(req))
          if (!me.ok) {
            sendJson(
              res,
              { ok: false, code: me.code, message: me.message },
              me.status || 401,
            )
            return
          }
          const isAdmin =
            me.user?.isRestaurantOwner === true ||
            me.user?.roleName === 'Admin' ||
            me.user?.roleName === 'Owner' ||
            (Array.isArray(me.user?.roleNames) &&
              (me.user.roleNames.includes('Admin') ||
                me.user.roleNames.includes('Owner')))
          if (!isAdmin) {
            sendJson(
              res,
              {
                ok: false,
                code: 'FORBIDDEN',
                message: 'Only an admin can enable offline mode',
              },
              403,
            )
            return
          }
          const result = unlockOfflineCheckout()
          sendJson(res, result, result.ok ? 200 : result.status || 400)
          return
        }

        if (req.method === 'DELETE' && path === '/v1/pos/offline-unlock') {
          sendJson(res, clearOfflineCheckoutUnlock())
          return
        }

        if (req.method === 'GET' && path === '/v1/pos/menu') {
          const me = localMe(bearerToken(req))
          if (!me.ok) {
            sendJson(
              res,
              { ok: false, code: me.code, message: me.message },
              me.status || 401,
            )
            return
          }
          const result = listLocalPosMenu()
          sendJson(res, result, result.ok ? 200 : result.status || 400)
          return
        }

        if (req.method === 'POST' && path === '/v1/pos/checkout') {
          let body
          try {
            body = await readJsonBody(req)
          } catch {
            sendJson(res, { ok: false, code: 'INVALID_JSON', message: 'Invalid JSON' }, 400)
            return
          }
          const me = localMe(bearerToken(req))
          if (!me.ok) {
            sendJson(
              res,
              { ok: false, code: me.code, message: me.message },
              me.status || 401,
            )
            return
          }
          const result = await localCheckout({ body, staffUser: me.user })
          if (!result.ok) {
            const status =
              result.code === 'INSUFFICIENT_STOCK_CONFIRM' ||
              result.code === 'INSUFFICIENT_STOCK'
                ? 409
                : result.code === 'ZATCA_SIGN_ERROR'
                  ? 502
                  : result.code === 'PRIMARY_TILL_REQUIRED' ||
                      result.code === 'OFFLINE_MODE_LOCKED' ||
                      result.code === 'BUSINESS_PROFILE_REQUIRED' ||
                      result.code === 'ZATCA_NOT_ONBOARDED'
                    ? 403
                    : 400
            sendJson(res, result, status)
            return
          }
          sendJson(res, result)
          return
        }

        if (req.method === 'GET' && path.startsWith('/v1/pos/invoice/')) {
          const invoiceId = path.slice('/v1/pos/invoice/'.length)
          if (!invoiceId) {
            sendJson(res, { ok: false, code: 'NOT_FOUND', message: 'Invoice id required' }, 404)
            return
          }
          const me = localMe(bearerToken(req))
          if (!me.ok) {
            sendJson(
              res,
              { ok: false, code: me.code, message: me.message },
              me.status || 401,
            )
            return
          }
          const result = getLocalInvoiceForPrint(invoiceId)
          sendJson(res, result, result.ok ? 200 : 404)
          return
        }

        if (
          req.method === 'PATCH' &&
          path.startsWith('/v1/kitchen-orders/') &&
          path.endsWith('/status')
        ) {
          const kitchenOrderId = path.slice(
            '/v1/kitchen-orders/'.length,
            -'/status'.length,
          )
          let body
          try {
            body = await readJsonBody(req)
          } catch {
            sendJson(res, { ok: false, code: 'INVALID_JSON', message: 'Invalid JSON' }, 400)
            return
          }
          const me = localMe(bearerToken(req))
          if (!me.ok) {
            sendJson(
              res,
              { ok: false, code: me.code, message: me.message },
              me.status || 401,
            )
            return
          }
          const result = updateKitchenStatus({
            kitchenOrderId,
            invoiceId: body.invoiceId,
            status: body.status,
            userId: me.user.id,
            allowNegative: body.allowNegative === true,
          })
          if (!result.ok) {
            const status =
              result.code === 'INSUFFICIENT_STOCK' ? 409 : result.code === 'NOT_FOUND' ? 404 : 400
            sendJson(res, result, status)
            return
          }
          sendJson(res, result)
          return
        }

        if (
          req.method === 'PATCH' &&
          path.startsWith('/v1/orders/') &&
          path.endsWith('/status')
        ) {
          const invoiceId = path.slice('/v1/orders/'.length, -'/status'.length)
          let body
          try {
            body = await readJsonBody(req)
          } catch {
            sendJson(res, { ok: false, code: 'INVALID_JSON', message: 'Invalid JSON' }, 400)
            return
          }
          const me = localMe(bearerToken(req))
          if (!me.ok) {
            sendJson(
              res,
              { ok: false, code: me.code, message: me.message },
              me.status || 401,
            )
            return
          }
          const result = updateKitchenStatus({
            invoiceId,
            status: body.status,
            userId: me.user.id,
            allowNegative: body.allowNegative === true,
          })
          if (!result.ok) {
            const status =
              result.code === 'INSUFFICIENT_STOCK' ? 409 : result.code === 'NOT_FOUND' ? 404 : 400
            sendJson(res, result, status)
            return
          }
          sendJson(res, result)
          return
        }

        if (req.method === 'GET' && path === '/v1/orders/board') {
          const me = localMe(bearerToken(req))
          if (!me.ok) {
            sendJson(
              res,
              { ok: false, code: me.code, message: me.message },
              me.status || 401,
            )
            return
          }
          const view = url.searchParams.get('view') === 'display' ? 'display' : 'kitchen'
          sendJson(res, listLocalKitchenBoard({ view }))
          return
        }

        if (req.method === 'GET' && path === '/v1/pos/till') {
          const tillId = url.searchParams.get('tillId')
          const info = getLocalTillPrimaryStatus(tillId)
          const { getLocalDb } = require('../db/open-db.cjs')
          let till = null
          if (info.tillId) {
            const row = getLocalDb()
              .prepare(`SELECT id, name, is_primary, payload_json FROM pos_tills WHERE id = ?`)
              .get(info.tillId)
            if (row) {
              let payload = {}
              try {
                payload = JSON.parse(row.payload_json || '{}')
              } catch {
                payload = {}
              }
              till = {
                ...payload,
                id: row.id,
                name: row.name,
                isPrimary: info.isPrimary,
              }
            }
          }
          sendJson(res, {
            ok: true,
            till,
            isPrimary: info.isPrimary,
            primaryPosTillId: info.primaryPosTillId,
          })
          return
        }

        if (req.method === 'GET' && path === '/v1/menu/items') {
          const me = localMe(bearerToken(req))
          if (!me.ok) {
            sendJson(
              res,
              { ok: false, code: me.code, message: me.message },
              me.status || 401,
            )
            return
          }
          const result = listLocalMenuItems({
            search: url.searchParams.get('search') || '',
            active: url.searchParams.get('active') || 'all',
            categoryId: url.searchParams.get('categoryId') || '',
            page: Number(url.searchParams.get('page') || 1),
            limit: Number(url.searchParams.get('limit') || 10),
          })
          if (!result.ok) {
            sendJson(res, result, result.status || 400)
            return
          }
          sendJson(res, result)
          return
        }

        if (req.method === 'GET' && path === '/v1/menu/categories') {
          const me = localMe(bearerToken(req))
          if (!me.ok) {
            sendJson(
              res,
              { ok: false, code: me.code, message: me.message },
              me.status || 401,
            )
            return
          }
          const result = listLocalMenuCategories()
          if (!result.ok) {
            sendJson(res, result, result.status || 400)
            return
          }
          sendJson(res, result)
          return
        }

        if (req.method === 'GET' && path === '/v1/invoices') {
          const me = localMe(bearerToken(req))
          if (!me.ok) {
            sendJson(
              res,
              { ok: false, code: me.code, message: me.message },
              me.status || 401,
            )
            return
          }
          const result = listLocalInvoices({
            search: url.searchParams.get('search') || '',
            page: Number(url.searchParams.get('page') || 1),
            limit: Number(url.searchParams.get('limit') || 10),
          })
          if (!result.ok) {
            sendJson(res, result, result.status || 400)
            return
          }
          sendJson(res, result)
          return
        }

        if (req.method === 'GET' && path.startsWith('/v1/invoices/')) {
          const me = localMe(bearerToken(req))
          if (!me.ok) {
            sendJson(
              res,
              { ok: false, code: me.code, message: me.message },
              me.status || 401,
            )
            return
          }
          const invoiceId = path.slice('/v1/invoices/'.length)
          const result = getLocalInvoiceDetail(invoiceId)
          if (!result.ok) {
            sendJson(res, result, result.status || 404)
            return
          }
          sendJson(res, result)
          return
        }

        if (req.method === 'GET' && path === '/v1/stock/items') {
          const me = localMe(bearerToken(req))
          if (!me.ok) {
            sendJson(
              res,
              { ok: false, code: me.code, message: me.message },
              me.status || 401,
            )
            return
          }
          const result = listLocalStockItems({
            search: url.searchParams.get('search') || '',
            page: Number(url.searchParams.get('page') || 1),
            limit: Number(url.searchParams.get('limit') || 10),
          })
          if (!result.ok) {
            sendJson(res, result, result.status || 400)
            return
          }
          sendJson(res, result)
          return
        }

        sendJson(res, { ok: false, error: 'NOT_FOUND' }, 404)
      } catch {
        sendJson(
          res,
          {
            ok: false,
            error: 'LOCAL_API_ERROR',
            message: 'Local API request failed',
          },
          500,
        )
      }
    })

    server.once('error', (err) => {
      if (err && err.code === 'EADDRINUSE' && preferredPort === DEFAULT_PORT) {
        server.listen(0, HOST)
        return
      }
      reject(err)
    })

    server.listen(preferredPort, HOST, () => {
      const addr = server.address()
      const port =
        typeof addr === 'object' && addr && 'port' in addr ? addr.port : preferredPort
      resolve({
        server,
        port,
        baseUrl: `http://${HOST}:${port}`,
      })
    })
  })
}

module.exports = { startLocalApi, DEFAULT_PORT, HOST }
