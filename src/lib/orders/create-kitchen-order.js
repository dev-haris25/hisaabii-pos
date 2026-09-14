import { kitchenLinesSnapshot } from '@/lib/orders/kitchen-lines-snapshot'
import { riyadhOrderDate } from '@/lib/orders/riyadh-order-date'

/**
 * Allocate the next daily kitchen # and create a pending ticket.
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx
 * @param {{
 *   businessProfileId: string
 *   invoiceId: string
 *   lines: Array<{ nameAr?: string | null, nameEn?: string | null, quantity?: number }>
 * }} opts
 */
export async function createKitchenOrderInTx(tx, opts) {
  const orderDate = riyadhOrderDate()
  const counter = await tx.kitchenOrderCounter.upsert({
    where: {
      businessProfileId_orderDate: {
        businessProfileId: opts.businessProfileId,
        orderDate,
      },
    },
    create: {
      businessProfileId: opts.businessProfileId,
      orderDate,
      lastNumber: 1,
    },
    update: { lastNumber: { increment: 1 } },
    select: { lastNumber: true },
  })

  return tx.kitchenOrder.create({
    data: {
      businessProfileId: opts.businessProfileId,
      invoiceId: opts.invoiceId,
      orderNumber: counter.lastNumber,
      orderDate,
      status: 'pending',
      linesSnapshot: kitchenLinesSnapshot(opts.lines),
      itemsUpdatedAt: new Date(),
    },
  })
}
