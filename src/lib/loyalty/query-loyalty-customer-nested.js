import {
  buildPaginationMeta,
  parseListPagination,
} from '@/lib/list-views/parse-list-pagination'
import { mapInvoiceListItemToJson } from '@/lib/invoices/map-invoice-json'
import { mapLoyaltyTransactionToJson } from '@/lib/loyalty/map-loyalty-account-json'
import { prisma } from '@/lib/prisma'
import { parseMoney } from '@/lib/invoices/invoice-compute-totals'

const invoiceListSelect = {
  id: true,
  invoiceNumber: true,
  status: true,
  invoiceDate: true,
  paymentMethod: true,
  grandTotal: true,
  totalVat: true,
  subtotal: true,
  zatcaStatus: true,
  zatcaLastError: true,
  qrCode: true,
  loyaltyPointsRedeemed: true,
  loyaltyDiscountAmount: true,
  loyaltyPointsAwarded: true,
  createdByStaff: { select: { id: true, name: true } },
}

const transactionInclude = {
  invoice: { select: { id: true, invoiceNumber: true } },
  cashierUser: { select: { id: true, name: true } },
}

/**
 * @param {{
 *   loyaltyAccountId: string
 *   loyaltyPointsRedeemed?: string | null
 *   loyaltyPointsAwarded?: boolean | null
 * }} row
 */
export function mapLoyaltyLinkedInvoiceToJson(row) {
  const redeemed = parseMoney(row.loyaltyPointsRedeemed)
  const hasRedeem = redeemed > 0.005
  const hasEarn = row.loyaltyPointsAwarded === true
  return {
    ...mapInvoiceListItemToJson(row),
    loyaltyPointsRedeemed: row.loyaltyPointsRedeemed ?? null,
    loyaltyDiscountAmount: row.loyaltyDiscountAmount ?? null,
    loyaltyPointsAwarded: row.loyaltyPointsAwarded === true,
    hasRedeem,
    hasEarn,
  }
}

/**
 * @param {{
 *   db?: typeof prisma
 *   accountId: string
 *   businessProfileId: string
 *   searchParams: URLSearchParams
 * }} opts
 */
export async function queryLoyaltyCustomerInvoicesPage({
  db = prisma,
  accountId,
  businessProfileId,
  searchParams,
}) {
  const where = {
    businessProfileId,
    loyaltyAccountId: accountId,
  }
  const orderBy = { createdAt: 'desc' }
  const { page, limit, skip } = parseListPagination(searchParams, {
    defaultLimit: 10,
  })
  const [total, rows] = await Promise.all([
    db.invoice.count({ where }),
    db.invoice.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      select: invoiceListSelect,
    }),
  ])
  return {
    invoices: rows.map(mapLoyaltyLinkedInvoiceToJson),
    pagination: buildPaginationMeta(page, limit, total),
  }
}

/**
 * @param {{
 *   db?: typeof prisma
 *   accountId: string
 *   searchParams: URLSearchParams
 * }} opts
 */
export async function queryLoyaltyCustomerTransactionsPage({
  db = prisma,
  accountId,
  searchParams,
}) {
  const where = { accountId }
  const orderBy = { createdAt: 'desc' }
  const { page, limit, skip } = parseListPagination(searchParams, {
    defaultLimit: 10,
  })
  const [total, rows] = await Promise.all([
    db.loyaltyTransaction.count({ where }),
    db.loyaltyTransaction.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: transactionInclude,
    }),
  ])
  return {
    transactions: rows.map(mapLoyaltyTransactionToJson),
    pagination: buildPaginationMeta(page, limit, total),
  }
}
