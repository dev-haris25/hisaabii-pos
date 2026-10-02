import { randomBytes } from 'node:crypto'

import { prisma } from '@/lib/prisma'

const MAX_ALLOC_ATTEMPTS = 12

/**
 * Cryptographically random, URL-safe table QR token (not sequential/guessable).
 * @returns {string}
 */
export function generateTableQrToken() {
  return randomBytes(24).toString('base64url')
}

/**
 * Allocate a qrToken unused on any Table row (global unique).
 * Pass `db` to run inside a transaction.
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof prisma} [db]
 * @returns {Promise<string>}
 */
export async function allocateUniqueTableQrToken(db = prisma) {
  for (let i = 0; i < MAX_ALLOC_ATTEMPTS; i++) {
    const token = generateTableQrToken()
    const hit = await db.table.findUnique({
      where: { qrToken: token },
      select: { id: true },
    })
    if (!hit) return token
  }
  throw new Error('Could not allocate table QR token')
}

/**
 * Tombstone token after soft-delete so the old printed QR cannot resolve.
 * @param {string} tableId
 */
export function deletedTableQrTokenPlaceholder(tableId) {
  return `deleted.${tableId}.${randomBytes(16).toString('hex')}`
}
