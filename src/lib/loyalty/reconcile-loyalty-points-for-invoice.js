/**
 * Reconcile loyalty points after a cancellation, soft-delete, or credit/debit
 * note is finalized. Compensating ledger rows use type ADJUSTMENT.
 *
 * For cancel/credit-debit: call only on post-ZATCA success — never on
 * failure/retry paths. For soft-delete: call in the same transaction as
 * deletedAt so a completed-but-unreported invoice still full-reverses.
 */

import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
import {
  decimalStringFromNumber,
  parseMoney,
} from '@/lib/invoices/invoice-compute-totals'
import { computeLoyaltyPointsEarned } from '@/lib/loyalty/compute-loyalty-points-earned'
import { adjustLoyaltyAccountBalance } from '@/lib/loyalty/loyalty-account-access'
import { prisma } from '@/lib/prisma'

/** @typedef {import('@/generated/prisma/client').Prisma.TransactionClient | typeof prisma} LoyaltyDb */

/**
 * @param {LoyaltyDb} db
 * @param {(tx: LoyaltyDb) => Promise<T>} fn
 * @template T
 */
async function runInTransaction(db, fn) {
  // Only the root PrismaClient can open a transaction. Interactive `tx` clients
  // may still expose `$transaction` under some adapters; nesting it closes the
  // outer soft-delete/cancel unit of work.
  const canOpenTransaction =
    typeof db?.$transaction === 'function' && typeof db?.$connect === 'function'
  if (canOpenTransaction) {
    return db.$transaction((tx) => fn(tx), PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)
  }
  return fn(db)
}

/**
 * Cheap involvement check — uses already-loaded invoice scalars only.
 *
 * @param {{
 *   loyaltyPointsAwarded?: boolean | null
 *   loyaltyAccountId?: string | null
 *   loyaltyPointsRedeemed?: string | null
 * }} invoice
 */
export function invoiceHasLoyaltyInvolvement(invoice) {
  if (invoice?.loyaltyPointsAwarded === true) return true
  if (
    invoice?.loyaltyAccountId != null &&
    String(invoice.loyaltyAccountId).trim() !== ''
  ) {
    return true
  }
  if (
    invoice?.loyaltyPointsRedeemed != null &&
    String(invoice.loyaltyPointsRedeemed).trim() !== '' &&
    parseMoney(invoice.loyaltyPointsRedeemed) > 0
  ) {
    return true
  }
  return false
}

/**
 * @param {LoyaltyDb} tx
 * @param {string} invoiceId
 * @param {string} accountId
 * @param {string} cashierUserId
 * @param {number} deltaPoints signed points amount
 */
async function applyAdjustment(tx, invoiceId, accountId, cashierUserId, deltaPoints) {
  if (!Number.isFinite(deltaPoints) || Math.abs(deltaPoints) < 0.005) {
    return
  }

  const pointsStr = decimalStringFromNumber(deltaPoints)
  const adjusted = await adjustLoyaltyAccountBalance(
    accountId,
    pointsStr,
    'delta',
    tx,
  )
  if ('error' in adjusted) {
    throw Object.assign(new Error(adjusted.message), {
      code: adjusted.error,
    })
  }

  await tx.loyaltyTransaction.create({
    data: {
      accountId,
      invoiceId,
      type: 'ADJUSTMENT',
      points: pointsStr,
      cashierUserId,
    },
  })
}

/**
 * Sum EARN + ADJUSTMENT points for an invoice (signed). Ignores REDEEM.
 *
 * @param {Array<{ type: string, points: string }>} rows
 */
function sumAwardedPoints(rows) {
  let total = 0
  for (const row of rows) {
    if (row.type === 'EARN' || row.type === 'ADJUSTMENT') {
      total += parseMoney(row.points)
    }
  }
  return total
}

/**
 * @param {{
 *   invoice: {
 *     id: string
 *     businessProfileId: string
 *     status: string
 *     grandTotal: string
 *     loyaltyPointsAwarded?: boolean | null
 *     loyaltyAccountId?: string | null
 *     loyaltyPointsRedeemed?: string | null
 *   }
 *   cashierUserId: string
 *   db?: LoyaltyDb
 * }} opts
 * @returns {Promise<{ skipped: true } | { skipped: false, adjustments: number }>}
 */
export async function reconcileLoyaltyPointsForInvoice(opts) {
  const { invoice, cashierUserId, db = prisma } = opts

  if (!invoiceHasLoyaltyInvolvement(invoice)) {
    return { skipped: true }
  }

  return runInTransaction(db, async (tx) => {
    const inv = await tx.invoice.findFirst({
      where: { id: invoice.id, businessProfileId: invoice.businessProfileId },
      select: {
        id: true,
        businessProfileId: true,
        status: true,
        deletedAt: true,
        grandTotal: true,
        loyaltyPointsAwarded: true,
        loyaltyAccountId: true,
        loyaltyPointsRedeemed: true,
      },
    })
    if (!inv || !invoiceHasLoyaltyInvolvement(inv)) {
      return { skipped: true }
    }

    let adjustments = 0

    // Full reversal: formal void (cancel) or soft-delete of pending/failed.
    if (inv.status === 'voided' || inv.deletedAt != null) {
      const ledger = await tx.loyaltyTransaction.findMany({
        where: { invoiceId: inv.id },
        select: { type: true, points: true, accountId: true },
      })

      const earnRows = ledger.filter((r) => r.type === 'EARN')
      const awardedNet = sumAwardedPoints(ledger)
      const accountId =
        inv.loyaltyAccountId ||
        earnRows[0]?.accountId ||
        ledger.find((r) => r.type === 'REDEEM')?.accountId ||
        null

      if (!accountId) {
        return { skipped: true }
      }

      // a) Reverse net awarded (EARN + prior ADJUSTMENTs) in full.
      // Do NOT clear loyaltyPointsAwarded — one-shot history stays.
      if (inv.loyaltyPointsAwarded === true && Math.abs(awardedNet) > 0.005) {
        await applyAdjustment(
          tx,
          inv.id,
          accountId,
          cashierUserId,
          -awardedNet,
        )
        adjustments += 1
      }

      // b) Refund redeemed points on full cancellation only.
      const redeemed = parseMoney(inv.loyaltyPointsRedeemed)
      if (redeemed > 0.005) {
        await applyAdjustment(
          tx,
          inv.id,
          accountId,
          cashierUserId,
          redeemed,
        )
        adjustments += 1
      }

      return { skipped: false, adjustments }
    }

    // Note path — invoice still completed; recompute earn only.
    if (inv.loyaltyPointsAwarded !== true) {
      return { skipped: true }
    }

    const settings = await tx.loyaltySettings.findUnique({
      where: { businessProfileId: inv.businessProfileId },
    })
    if (!settings) {
      return { skipped: true }
    }

    const [creditNotes, debitNotes, ledger] = await Promise.all([
      tx.creditNote.findMany({
        where: { invoiceId: inv.id, ...WHERE_NOT_DELETED },
        select: { grandTotal: true },
      }),
      tx.debitNote.findMany({
        where: { invoiceId: inv.id, ...WHERE_NOT_DELETED },
        select: { grandTotal: true },
      }),
      tx.loyaltyTransaction.findMany({
        where: { invoiceId: inv.id },
        select: { type: true, points: true, accountId: true },
      }),
    ])

    const creditSum = creditNotes.reduce(
      (s, n) => s + parseMoney(n.grandTotal),
      0,
    )
    const debitSum = debitNotes.reduce(
      (s, n) => s + parseMoney(n.grandTotal),
      0,
    )
    const effectivePaid = Math.max(
      0,
      parseMoney(inv.grandTotal) - creditSum + debitSum,
    )

    const shouldExist = parseMoney(
      computeLoyaltyPointsEarned(effectivePaid, settings),
    )
    const awardedSoFar = sumAwardedPoints(ledger)
    const delta = Math.round((shouldExist - awardedSoFar) * 100) / 100

    if (Math.abs(delta) < 0.005) {
      return { skipped: false, adjustments: 0 }
    }

    const accountId =
      inv.loyaltyAccountId ||
      ledger.find((r) => r.type === 'EARN' || r.type === 'ADJUSTMENT')
        ?.accountId ||
      null
    if (!accountId) {
      return { skipped: true }
    }

    await applyAdjustment(tx, inv.id, accountId, cashierUserId, delta)
    return { skipped: false, adjustments: 1 }
  })
}
