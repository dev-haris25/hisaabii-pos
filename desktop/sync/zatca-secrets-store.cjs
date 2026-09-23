const { safeStorage, app } = require('electron')
const {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  unlinkSync,
} = require('node:fs')
const { join } = require('node:path')

function secretsPath() {
  const dir = join(app.getPath('userData'), 'secure')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'zatca-secrets.dat')
}

function isSafeStorageAvailable() {
  try {
    return safeStorage.isEncryptionAvailable() === true
  } catch {
    return false
  }
}

/**
 * Encrypt/decrypt a probe string without touching the real CSID file.
 * @returns {{
 *   ok: boolean
 *   encryptionAvailable: boolean
 *   roundTrip: boolean
 *   error?: string
 * }}
 */
function testSafeStorageRoundTrip() {
  const encryptionAvailable = isSafeStorageAvailable()
  if (!encryptionAvailable) {
    return {
      ok: false,
      encryptionAvailable: false,
      roundTrip: false,
      error: 'SAFE_STORAGE_UNAVAILABLE',
    }
  }

  const dir = join(app.getPath('userData'), 'secure')
  mkdirSync(dir, { recursive: true })
  const probePath = join(dir, 'safe-storage-self-test.dat')
  const probePlain = `hisabi-safe-storage-probe:${Date.now()}`

  try {
    const encrypted = safeStorage.encryptString(probePlain)
    writeFileSync(probePath, encrypted)
    const decrypted = safeStorage.decryptString(readFileSync(probePath))
    const roundTrip = decrypted === probePlain
    return {
      ok: roundTrip,
      encryptionAvailable: true,
      roundTrip,
      error: roundTrip ? undefined : 'ROUND_TRIP_MISMATCH',
    }
  } catch (err) {
    return {
      ok: false,
      encryptionAvailable: true,
      roundTrip: false,
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    try {
      if (existsSync(probePath)) unlinkSync(probePath)
    } catch {
      /* ignore */
    }
  }
}

/**
 * @param {string} businessProfileId
 * @param {unknown} secrets
 */
function storeZatcaSecrets(businessProfileId, secrets) {
  if (!businessProfileId) throw new Error('businessProfileId required')
  if (!secrets) {
    return { ok: true, stored: false }
  }
  if (!isSafeStorageAvailable()) {
    throw new Error('SAFE_STORAGE_UNAVAILABLE')
  }
  const payload = Buffer.from(
    JSON.stringify({
      businessProfileId,
      secrets,
      storedAt: new Date().toISOString(),
    }),
    'utf8',
  )
  const encrypted = safeStorage.encryptString(payload.toString('utf8'))
  writeFileSync(secretsPath(), encrypted)
  return { ok: true, stored: true }
}

/**
 * @returns {{ businessProfileId: string, secrets: unknown } | null}
 */
function loadZatcaSecrets() {
  const path = secretsPath()
  if (!existsSync(path)) return null
  if (!isSafeStorageAvailable()) return null
  try {
    const encrypted = readFileSync(path)
    const raw = safeStorage.decryptString(encrypted)
    return JSON.parse(raw)
  } catch {
    return null
  }
}

module.exports = {
  storeZatcaSecrets,
  loadZatcaSecrets,
  isSafeStorageAvailable,
  testSafeStorageRoundTrip,
}
