import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { mapKitchenBoardOrder } from '@/lib/orders/map-kitchen-board-order'
import { prisma } from '@/lib/prisma'

/**
 * Preparing + ready tickets for the public customer TV (no line items).
 * @param {string} businessProfileId
 */
export async function loadPublicCustomerQueue(businessProfileId) {
  const invoiceOk = { ...WHERE_NOT_DELETED, status: { not: 'voided' } }
  const rows = await prisma.kitchenOrder.findMany({
    where: {
      businessProfileId,
      status: { in: ['preparing', 'ready'] },
      invoice: invoiceOk,
    },
    orderBy: [{ createdAt: 'asc' }],
    select: {
      invoiceId: true,
      orderNumber: true,
      status: true,
      itemsUpdatedAt: true,
      linesSnapshot: true,
      createdAt: true,
      completedAt: true,
    },
  })
  const preparing = []
  const ready = []
  for (const row of rows) {
    const mapped = mapKitchenBoardOrder(row, 'display')
    if (row.status === 'ready') ready.push(mapped)
    else preparing.push(mapped)
  }
  return { preparing, ready, view: 'display' }
}
