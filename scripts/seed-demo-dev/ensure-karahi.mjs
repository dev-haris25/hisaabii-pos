import { AR } from './ar.mjs'
import { log } from './db.mjs'

/**
 * Add Chicken Karahi to an existing demo menu without replacing other items.
 * @param {import('../../src/generated/prisma/client.ts').PrismaClient | import('../../src/generated/prisma/client.ts').Prisma.TransactionClient} db
 * @param {string} businessProfileId
 */
export async function ensureKarahiMenuItem(db, businessProfileId) {
  const existing = await db.menuItem.findFirst({
    where: {
      businessProfileId,
      nameEn: { equals: 'Chicken Karahi', mode: 'insensitive' },
    },
    select: { id: true },
  })
  if (existing) {
    log('Menu already has Chicken Karahi')
    return existing
  }

  const meals = await db.menuCategory.findFirst({
    where: {
      businessProfileId,
      OR: [
        { nameEn: { equals: 'Meals', mode: 'insensitive' } },
        { nameAr: AR.meals },
      ],
    },
    select: { id: true },
  })
  if (!meals) throw new Error('Meals category missing — cannot add Karahi')

  const created = await db.menuItem.create({
    data: {
      businessProfileId,
      categoryId: meals.id,
      nameAr: AR.karahi,
      nameEn: 'Chicken Karahi',
      price: '30.00',
      vatPreset: 'standard',
      active: true,
      sortOrder: 3,
    },
    select: { id: true },
  })
  log('Menu added: Chicken Karahi')
  return created
}
