const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('node:fs')
const { join } = require('node:path')
const { randomBytes } = require('node:crypto')
const { app } = require('electron')

/**
 * Stable HMAC secret for offline session tokens (not the cloud AUTH_SECRET).
 */
function getOfflineAuthSecret() {
  if (process.env.HISABI_OFFLINE_AUTH_SECRET?.trim()) {
    return process.env.HISABI_OFFLINE_AUTH_SECRET.trim()
  }
  const dir = join(app.getPath('userData'), 'secure')
  mkdirSync(dir, { recursive: true })
  const path = join(dir, 'offline-auth-secret.txt')
  if (existsSync(path)) {
    return readFileSync(path, 'utf8').trim()
  }
  const secret = randomBytes(32).toString('hex')
  writeFileSync(path, secret, 'utf8')
  return secret
}

module.exports = { getOfflineAuthSecret }
