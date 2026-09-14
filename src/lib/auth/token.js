import { createHmac, timingSafeEqual } from 'node:crypto'

function getSecret() {
  const s = process.env.AUTH_SECRET
  if (!s && process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET is required in production')
  }
  return s || 'development-insecure-auth-secret'
}

/**
 * @param {Record<string, unknown>} payload Must include numeric `exp` (unix seconds).
 */
export function signPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const sig = createHmac('sha256', getSecret()).update(body).digest('hex')
  return `${body}.${sig}`
}

/**
 * @returns {Record<string, unknown> | null}
 */
export function verifySignedToken(token) {
  if (!token || typeof token !== 'string') return null
  const dot = token.lastIndexOf('.')
  if (dot === -1) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = createHmac('sha256', getSecret()).update(body).digest('hex')
  if (sig.length !== expected.length) return null
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  } catch {
    return null
  }
  let json
  try {
    json = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (typeof json.exp !== 'number' || json.exp < Date.now() / 1000) return null
  return json
}
