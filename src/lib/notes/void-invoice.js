import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { reconcileLoyaltyPointsForInvoice } from '@/lib/loyalty/reconcile-loyalty-points-for-invoice'
import { isInvoiceFullyCredited } from '@/lib/notes/invoice-outstanding'
import { loadInvoiceOutstanding } from '@/lib/notes/load-invoice-outstanding'
import { notifyPosAudience } from '@/lib/notifications/notify-owner-and-actor'
import { releaseOfferUsages } from '@/lib/offers/offer-usage'
import { cancelKitchenOrderForInvoice } from '@/lib/orders/sync-kitchen-order'
import { prisma } from '@/lib/prisma'

/**
 * Void side effects, run exactly once per invoice: the guarded status write
 * only succeeds for the first caller; later callers do nothing.
 *
 * @param {{ invoice: import('@/generated/prisma/client').Invoice, actorUserId?: string | null }} opts
 * @returns {Promise<boolean>} true when this call voided the invoice
 */
export async function voidInvoiceOnce({ invoice, actorUserId = null }) {
  const claimed = await prisma.invoice.updateMany({
    where: { id: invoice.id, status: { not: 'voided' } },
    data: { status: 'voided' },
  })
  if (claimed.count !== 1) return false

  // Offers & Deals: a voided sale gives its offer uses back.
  await releaseOfferUsages(prisma, { invoiceId: invoice.id })
  await cancelKitchenOrderForInvoice(prisma, invoice.id)
  void notifyPosAudience({
    businessProfileId: invoice.businessProfileId,
    audience: 'salesOps',
    type: 'invoice_voided',
    kind: 'salesOps',
    vars: { detail: `Invoice ${invoice.invoiceNumber} was voided` },
    link: `/invoices/${invoice.id}`,
    dedupeKey: `invoice-voided:${invoice.id}`,
    actorUserId,
  })
  // Loyalty is a post-success side effect: the void already committed.
  try {
    await reconcileLoyaltyPointsForInvoice({
      invoice: { ...invoice, status: 'voided' },
      cashierUserId: actorUserId,
    })
  } catch (loyaltyErr) {
    console.error(
      '[loyalty] reconcile after void failed (invoice already voided):',
      loyaltyErr instanceof Error ? loyaltyErr.message : loyaltyErr,
      { invoiceId: invoice.id },
    )
  }
  return true
}

/**
 * After a credit note is accepted by ZATCA: void the invoice when nothing is
 * left outstanding (before-VAT amount exactly zero).
 *
 * @param {{ invoiceId: string, businessProfileId: string, actorUserId?: string | null }} opts
 * @returns {Promise<boolean>} true when this call voided the invoice
 */
export async function voidInvoiceIfFullyCredited({
  invoiceId,
  businessProfileId,
  actorUserId = null,
}) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, businessProfileId, ...WHERE_NOT_DELETED },
    include: { lines: true },
  })
  if (!invoice || invoice.status === 'voided') return false
  const outstanding = await loadInvoiceOutstanding(prisma, invoice)
  if (!isInvoiceFullyCredited(outstanding)) return false
  return voidInvoiceOnce({ invoice, actorUserId })
}
