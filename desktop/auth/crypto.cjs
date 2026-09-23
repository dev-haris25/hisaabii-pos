const { randomBytes, scryptSync, timingSafeEqual, createHash, createHmac } =
  require('node:crypto')

const KEYLEN = 64

/**
 * @param {string} password
 * @param {string} stored
 */
function verifyPassword(password, stored) {
  if (!password || !stored || typeof stored !== 'string') return false
  if (stored === 'migrated:disabled') return false
  const idx = stored.indexOf(':')
  if (idx === -1) return false
  try {
    const salt = Buffer.from(stored.slice(0, idx), 'hex')
    const expected = Buffer.from(stored.slice(idx + 1), 'hex')
    if (salt.length === 0 || expected.length === 0) return false
    const key = scryptSync(password, salt, KEYLEN)
    if (key.length !== expected.length) return false
    return timingSafeEqual(key, expected)
  } catch {
    return false
  }
}

/**
 * @param {string} value
 */
function sha256Hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

/**
 * @param {string} secret
 * @param {Record<string, unknown>} payload
 */
function signLocalToken(secret, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const sig = createHmac('sha256', secret).update(body).digest('hex')
  return `${body}.${sig}`
}

/**
 * @param {string} secret
 * @param {string} token
 */
function verifyLocalToken(secret, token) {
  if (!token || typeof token !== 'string') return null
  const dot = token.lastIndexOf('.')
  if (dot === -1) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = createHmac('sha256', secret).update(body).digest('hex')
  if (sig.length !== expected.length) return null
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  } catch {
    return null
  }
  try {
    const json = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (typeof json.exp !== 'number' || json.exp < Date.now() / 1000) return null
    return json
  } catch {
    return null
  }
}

function randomTokenId() {
  return randomBytes(24).toString('hex')
}

module.exports = {
  verifyPassword,
  sha256Hex,
  signLocalToken,
  verifyLocalToken,
  randomTokenId,
}
