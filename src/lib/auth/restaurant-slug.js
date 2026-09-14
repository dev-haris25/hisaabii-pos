import { createHash, randomBytes } from 'node:crypto'

/**
 * System-generated unique restaurant slug (e.g. r-a7k2m9xq).
 */
export function generateRestaurantSlug() {
  const bytes = randomBytes(6)
  const part = bytes.toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8)
  return `r-${part || createHash('sha256').update(String(Date.now())).digest('hex').slice(0, 8)}`
}
