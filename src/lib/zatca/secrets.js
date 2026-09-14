import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/**
 * Derives a stable AES-256 key from AUTH_SECRET, namespaced so this key is never
 * reused for anything other than ZATCA secrets (private key, compliance/production
 * CSID secrets) even if AUTH_SECRET is reused elsewhere (session cookie signing).
 */
function getMasterKey() {
  const secret = process.env.AUTH_SECRET?.trim()
  if (!secret) {
    throw new Error('AUTH_SECRET is required to encrypt ZATCA keys')
  }
  return createHash('sha256').update(`zatca:${secret}`).digest()
}

/**
 * AES-256-GCM encrypt. Used for ZatcaDevice.privateKeyEnc / complianceSecretEnc /
 * productionSecretEnc — these must never be stored as plain text (rules.md #17).
 * @param {string} plaintext
 */
export function encryptZatcaSecret(plaintext) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getMasterKey(), iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`
}

/** @param {string} payload */
export function decryptZatcaSecret(payload) {
  const [ivB64, tagB64, dataB64] = payload.split('.')
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid encrypted ZATCA payload')
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    getMasterKey(),
    Buffer.from(ivB64, 'base64url'),
  )
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
  return (
    decipher.update(Buffer.from(dataB64, 'base64url'), undefined, 'utf8') +
    decipher.final('utf8')
  )
}
