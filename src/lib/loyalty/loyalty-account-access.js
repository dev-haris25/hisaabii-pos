/**
 * LoyaltyAccount data-access primitives.
 * Every phone-accepting call goes through `normalizeLoyaltyPhone` — never
 * look up or create by raw/unnormalized phone.
 *
 * Optional `db` matches Coupons helpers (standalone or inside a larger tx).
 */

import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
import {
  decimalStringFromNumber,
  parseMoney,
} from '@/lib/invoices/invoice-compute-totals'
import { normalizeLoyaltyPhone } from '@/lib/loyalty/normalize-loyalty-phone'
import { prisma } from '@/lib/prisma'

/** @typedef {import('@/generated/prisma/client').Prisma.TransactionClient | typeof prisma} LoyaltyDb */
/** @typedef {import('@/generated/prisma/client').LoyaltyAccount} LoyaltyAccountRow */

/**
 * @param {LoyaltyDb} db
 * @param {(tx: LoyaltyDb) => Promise<T>} fn
 * @template T
 */
async function runInTransaction(db, fn) {
  if (typeof db?.$transaction === 'function') {
    return db.$transaction((tx) => fn(tx), PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)
  }
  return fn(db)
}

/**
 * @param {unknown} rawPhone
 * @returns {{
 *   ok: true
 *   phone: string
 * } | {
 *   ok: false
 *   error: 'INVALID_PHONE_FORMAT'
 *   reason: 'invalid_length' | 'invalid_prefix'
 *   message: string
 * }}
 */
function normalizePhoneOrError(rawPhone) {
  const result = normalizeLoyaltyPhone(rawPhone)
  if (!result.valid) {
    return {
      ok: false,
      error: 'INVALID_PHONE_FORMAT',
      reason: result.reason,
      message: result.error,
    }
  }
  return { ok: true, phone: result.normalized }
}

/**
 * Find an active (not soft-deleted) loyalty account by phone.
 *
 * @param {string} businessProfileId
 * @param {unknown} rawPhone
 * @param {LoyaltyDb} [db]
 * @returns {Promise<
 *   | { account: LoyaltyAccountRow }
 *   | { error: 'INVALID_PHONE_FORMAT', reason: 'invalid_length' | 'invalid_prefix', message: string }
 *   | null
 * >}
 */
export async function findLoyaltyAccountByPhone(
  businessProfileId,
  rawPhone,
  db = prisma,
) {
  const normalized = normalizePhoneOrError(rawPhone)
  if (!normalized.ok) {
    return {
      error: normalized.error,
      reason: normalized.reason,
      message: normalized.message,
    }
  }

  const account = await db.loyaltyAccount.findFirst({
    where: {
      businessProfileId,
      phone: normalized.phone,
      ...WHERE_NOT_DELETED,
    },
  })

  if (!account) return null
  return { account }
}

/**
 * Find an active loyalty account by phone, or create one with balance "0".
 *
 * @param {string} businessProfileId
 * @param {unknown} rawPhone
 * @param {LoyaltyDb} [db]
 * @returns {Promise<
 *   | { account: LoyaltyAccountRow }
 *   | { error: 'INVALID_PHONE_FORMAT', reason: 'invalid_length' | 'invalid_prefix', message: string }
 * >}
 */
export async function findOrCreateLoyaltyAccount(
  businessProfileId,
  rawPhone,
  db = prisma,
) {
  const existing = await findLoyaltyAccountByPhone(
    businessProfileId,
    rawPhone,
    db,
  )
  if (existing && 'error' in existing) return existing
  if (existing?.account) return { account: existing.account }

  const normalized = normalizePhoneOrError(rawPhone)
  if (!normalized.ok) {
    return {
      error: normalized.error,
      reason: normalized.reason,
      message: normalized.message,
    }
  }

  const account = await db.loyaltyAccount.create({
    data: {
      businessProfileId,
      phone: normalized.phone,
      balance: '0',
    },
  })
  return { account }
}

/**
 * Low-level balance write. No business-rule checks (negative, caps, etc.).
 *
 * @param {string} accountId
 * @param {string | number} deltaOrAbsolute
 * @param {'delta' | 'absolute'} mode
 * @param {LoyaltyDb} [db]
 * @returns {Promise<
 *   | { account: LoyaltyAccountRow }
 *   | { error: 'ACCOUNT_NOT_FOUND', message: string }
 * >}
 */
export async function adjustLoyaltyAccountBalance(
  accountId,
  deltaOrAbsolute,
  mode,
  db = prisma,
) {
  const current = await db.loyaltyAccount.findFirst({
    where: { id: accountId, ...WHERE_NOT_DELETED },
  })
  if (!current) {
    return {
      error: 'ACCOUNT_NOT_FOUND',
      message: 'Loyalty account was not found',
    }
  }

  const nextBalance =
    mode === 'absolute'
      ? decimalStringFromNumber(parseMoney(deltaOrAbsolute))
      : decimalStringFromNumber(
          parseMoney(current.balance) + parseMoney(deltaOrAbsolute),
        )

  const account = await db.loyaltyAccount.update({
    where: { id: accountId },
    data: { balance: nextBalance },
  })
  return { account }
}

/**
 * Soft-delete a loyalty account (`deletedAt` + clear `phone` so the number
 * is reusable). Does not touch LoyaltyTransaction rows.
 *
 * @param {string} accountId
 * @param {LoyaltyDb} [db]
 * @returns {Promise<
 *   | { account: LoyaltyAccountRow }
 *   | { error: 'ACCOUNT_NOT_FOUND' | 'ACCOUNT_ALREADY_DELETED', message: string }
 * >}
 */
export async function softDeleteLoyaltyAccount(accountId, db = prisma) {
  const current = await db.loyaltyAccount.findUnique({
    where: { id: accountId },
  })
  if (!current) {
    return {
      error: 'ACCOUNT_NOT_FOUND',
      message: 'Loyalty account was not found',
    }
  }
  if (current.deletedAt != null) {
    return {
      error: 'ACCOUNT_ALREADY_DELETED',
      message: 'Loyalty account is already deleted',
    }
  }

  const account = await db.loyaltyAccount.update({
    where: { id: accountId },
    data: { deletedAt: new Date(), phone: null },
  })
  return { account }
}

/**
 * Merge duplicate into survivor in one transaction:
 * balance delta → reassign transactions → soft-delete duplicate.
 *
 * @param {string} survivorAccountId
 * @param {string} duplicateAccountId
 * @param {LoyaltyDb} [db]
 * @returns {Promise<
 *   | { survivor: LoyaltyAccountRow }
 *   | { error: string, message: string }
 * >}
 */
export async function mergeLoyaltyAccounts(
  survivorAccountId,
  duplicateAccountId,
  db = prisma,
) {
  if (survivorAccountId === duplicateAccountId) {
    return {
      error: 'SAME_ACCOUNT',
      message: 'Cannot merge a loyalty account into itself',
    }
  }

  return runInTransaction(db, async (tx) => {
    const survivor = await tx.loyaltyAccount.findUnique({
      where: { id: survivorAccountId },
    })
    const duplicate = await tx.loyaltyAccount.findUnique({
      where: { id: duplicateAccountId },
    })

    if (!survivor || !duplicate) {
      return {
        error: 'ACCOUNT_NOT_FOUND',
        message: 'One or both loyalty accounts were not found',
      }
    }
    if (survivor.deletedAt != null || duplicate.deletedAt != null) {
      return {
        error: 'ACCOUNT_ALREADY_DELETED',
        message: 'Cannot merge a deleted loyalty account',
      }
    }

    const adjusted = await adjustLoyaltyAccountBalance(
      survivorAccountId,
      duplicate.balance,
      'delta',
      tx,
    )
    if ('error' in adjusted) return adjusted

    await tx.loyaltyTransaction.updateMany({
      where: { accountId: duplicateAccountId },
      data: { accountId: survivorAccountId },
    })

    const deleted = await softDeleteLoyaltyAccount(duplicateAccountId, tx)
    if ('error' in deleted) return deleted

    return { survivor: adjusted.account }
  })
}
