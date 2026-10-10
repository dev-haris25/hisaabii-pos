/**
 * Develop / local seed: owner + menu + stock + recipes.
 * Idempotent on demo@hisaabiipos.com. No sales / invoices.
 * When the owner already exists, ensures missing menu/stock/recipes only
 * (never duplicates; never touches other businesses).
 *
 * Run: bun scripts/seed-demo-dev.mjs
 *   or: bun run db:seed-demo-dev
 */
import { hashPassword } from '../src/lib/auth/password.js'
import { generateRestaurantSlug } from '../src/lib/auth/restaurant-slug.js'
import { AR } from './seed-demo-dev/ar.mjs'
import { createPrisma, log } from './seed-demo-dev/db.mjs'
import { ensureMenu } from './seed-demo-dev/ensure-menu.mjs'
import { ensureRecipes } from './seed-demo-dev/ensure-recipes.mjs'
import { ensureStockItems } from './seed-demo-dev/ensure-stock.mjs'

const DEMO_EMAIL = 'demo@hisaabiipos.com'
const DEMO_PASSWORD = 'Demo@123'
const DEMO_NAME = 'Demo Owner'
const DEMO_VAT = '300000000000003'

/**
 * @param {import('../src/generated/prisma/client.ts').PrismaClient} prisma
 * @param {{ businessProfileId: string, userId: string }} opts
 */
async function ensureDemoCatalog(prisma, { businessProfileId, userId }) {
  await prisma.businessSettings.upsert({
    where: { businessProfileId },
    create: {
      businessProfileId,
      lowStockAlertsEnabled: true,
      allowNegativeStock: false,
    },
    update: { lowStockAlertsEnabled: true },
  })

  await prisma.$transaction(
    async (tx) => {
      const menuStats = await ensureMenu(tx, businessProfileId)
      const stockStats = await ensureStockItems(tx, {
        businessProfileId,
        createdByUserId: userId,
      })
      await ensureRecipes(tx, {
        businessProfileId,
        stockByKey: stockStats.byKey,
      })

      log(
        `Menu — existing: ${menuStats.itemsExisting.length}, created: ${menuStats.itemsCreated.length}`,
      )
      log(
        `Categories — existing: ${menuStats.categoriesExisting.length}, created: ${menuStats.categoriesCreated.length}`,
      )
      log(
        `Stock — reused: ${stockStats.reused.length}, created: ${stockStats.created.length}`,
      )
      if (menuStats.itemsCreated.length) {
        log(`New menu items: ${menuStats.itemsCreated.join(', ')}`)
      }
      if (stockStats.created.length) {
        log(`New stock: ${stockStats.created.join(', ')}`)
      }
    },
    { maxWait: 20_000, timeout: 120_000 },
  )
}

async function main() {
  const prisma = createPrisma()
  try {
    const existing = await prisma.user.findUnique({
      where: { email: DEMO_EMAIL },
      select: {
        id: true,
        activeBusinessProfileId: true,
        ownedBusinesses: { select: { id: true }, take: 1 },
      },
    })

    if (existing) {
      const profileId =
        existing.activeBusinessProfileId ?? existing.ownedBusinesses[0]?.id
      if (!profileId) {
        throw new Error(`User ${DEMO_EMAIL} exists but has no business profile`)
      }
      log(
        `Owner exists — ensure missing menu + stock + recipes. profileId=${profileId}`,
      )
      await ensureDemoCatalog(prisma, {
        businessProfileId: profileId,
        userId: existing.id,
      })
      log('Done — Demo Restaurant catalog ensured (no duplicates).')
      return
    }

    const passwordHash = hashPassword(DEMO_PASSWORD)
    /** @type {{ userId: string, profileId: string }} */
    let created = { userId: '', profileId: '' }

    await prisma.$transaction(
      async (tx) => {
        const user = await tx.user.create({
          data: {
            name: DEMO_NAME,
            email: DEMO_EMAIL,
            passwordHash,
            emailVerified: true,
            active: true,
          },
        })

        const profile = await tx.businessProfile.create({
          data: {
            ownerUserId: user.id,
            companyNameAr: AR.company,
            companyNameEn: 'Demo Restaurant',
            crNumber: '1010000000',
            vatNumber: DEMO_VAT,
            addressAr: AR.address,
            addressEn: 'Riyadh, Saudi Arabia',
            streetAr: AR.street,
            streetEn: 'King Fahd Road',
            districtAr: AR.district,
            districtEn: 'Olaya',
            cityAr: AR.city,
            cityEn: 'Riyadh',
            buildingNumber: '1234',
            postalCode: '12211',
            email: DEMO_EMAIL,
            phone: '0500000000',
            slug: generateRestaurantSlug(),
            customerQueueLocale: 'ar',
            onboardingCompletedAt: new Date(),
            zatcaOnboardingSkipped: true,
            zatcaEnvironment: 'sandbox',
          },
        })

        await tx.user.update({
          where: { id: user.id },
          data: { activeBusinessProfileId: profile.id },
        })

        await tx.businessMembership.create({
          data: { userId: user.id, businessProfileId: profile.id },
        })

        await tx.businessSettings.create({
          data: {
            businessProfileId: profile.id,
            lowStockAlertsEnabled: true,
            allowNegativeStock: false,
          },
        })

        created = { userId: user.id, profileId: profile.id }
        log(`Created owner userId=${user.id} profileId=${profile.id}`)
      },
      { maxWait: 20_000, timeout: 120_000 },
    )

    await ensureDemoCatalog(prisma, {
      businessProfileId: created.profileId,
      userId: created.userId,
    })

    log(
      `Done — owner + menu + stock + recipes (no sales). Login ${DEMO_EMAIL} / ${DEMO_PASSWORD}`,
    )
    log(`userId=${created.userId} profileId=${created.profileId}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error('[seed-demo-dev] failed:', err)
  process.exit(1)
})
