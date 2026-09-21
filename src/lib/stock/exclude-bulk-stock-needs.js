/**
 * Recipe deduct skips bulk items — owner enters those on the day-end report.
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof import('@/lib/prisma').prisma} db
 * @param {string} businessProfileId
 * @param {Array<{ stockItemId: string }>} needs
 */
export async function excludeBulkStockNeeds(db, businessProfileId, needs) {
  if (!needs.length) return []
  const bulk = await db.stockItem.findMany({
    where: {
      businessProfileId,
      isBulk: true,
      id: { in: needs.map((n) => n.stockItemId) },
    },
    select: { id: true },
  })
  const skip = new Set(bulk.map((b) => b.id))
  return needs.filter((n) => !skip.has(n.stockItemId))
}
