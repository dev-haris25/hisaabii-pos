/**
 * Develop/staging seed: one owner account + demo menu.
 * Idempotent on demo@hisaabiipos.com — safe to re-run on every deploy.
 *
 * Does NOT create RBAC roles (owner access is via BusinessProfile.ownerUserId).
 * Does NOT create invoices, tills, HR data, etc.
 *
 * Run: bun scripts/seed-demo-dev.mjs
 *   or: bun run db:seed-demo-dev
 */
import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client.ts'
import { Pool } from 'pg'

import { hashPassword } from '../src/lib/auth/password.js'
import { generateRestaurantSlug } from '../src/lib/auth/restaurant-slug.js'

const DEMO_EMAIL = 'demo@hisaabiipos.com'
const DEMO_PASSWORD = 'Demo@123'
const DEMO_NAME = 'Demo Owner'
const DEMO_VAT = '300000000000003'

/** @param {string} raw */
function connectionStringForPool(raw) {
  const s = raw.replace(/([?&])sslmode=[^&]*/gi, '$1')
  return s.replace(/\?&/, '?').replace(/[?&]$/, '')
}

function createPrisma() {
  const connectionString = process.env.DATABASE_URL?.trim()
  if (!connectionString) throw new Error('DATABASE_URL is not set')
  const useSsl =
    process.env.DATABASE_SSL === 'true' || /sslmode=/i.test(connectionString)
  const pool = new Pool({
    connectionString: connectionStringForPool(connectionString),
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  })
  return new PrismaClient({ adapter: new PrismaPg(pool) })
}

function log(msg) {
  console.info(`[seed-demo-dev] ${msg}`)
}

/** @type {{ nameAr: string, nameEn: string, sortOrder: number, items: Array<{ nameAr: string, nameEn: string, price: string, sortOrder: number, variants?: Array<{ nameAr: string, nameEn: string, options: Array<{ nameAr: string, nameEn: string, priceChange: string, isDefault?: boolean }> }>, customizations?: Array<{ nameAr: string, nameEn: string, priceChange: string }> }> }}[]} */
const MENU = [
  {
    nameAr: 'وجبات',
    nameEn: 'Meals',
    sortOrder: 0,
    items: [
      {
        nameAr: 'بروست دجاج',
        nameEn: 'Chicken Broast',
        price: '28.00',
        sortOrder: 0,
        variants: [
          {
            nameAr: 'الحجم',
            nameEn: 'Size',
            options: [
              { nameAr: 'عادي', nameEn: 'Regular', priceChange: '0', isDefault: true },
              { nameAr: 'كبير', nameEn: 'Large', priceChange: '8.00' },
            ],
          },
        ],
        customizations: [
          { nameAr: 'صلصة إضافية', nameEn: 'Extra sauce', priceChange: '2.00' },
        ],
      },
      {
        nameAr: 'برجر لحم',
        nameEn: 'Beef Burger',
        price: '32.00',
        sortOrder: 1,
        customizations: [
          { nameAr: 'جبنة إضافية', nameEn: 'Extra cheese', priceChange: '3.00' },
        ],
      },
      {
        nameAr: 'شاورما دجاج',
        nameEn: 'Chicken Shawarma',
        price: '18.00',
        sortOrder: 2,
      },
    ],
  },
  {
    nameAr: 'مشروبات',
    nameEn: 'Drinks',
    sortOrder: 1,
    items: [
      {
        nameAr: 'ماء',
        nameEn: 'Water',
        price: '2.00',
        sortOrder: 0,
      },
      {
        nameAr: 'مشروب غازي',
        nameEn: 'Soft Drink',
        price: '5.00',
        sortOrder: 1,
        variants: [
          {
            nameAr: 'الحجم',
            nameEn: 'Size',
            options: [
              { nameAr: 'علبة', nameEn: 'Can', priceChange: '0', isDefault: true },
              { nameAr: 'كبير', nameEn: 'Large', priceChange: '2.00' },
            ],
          },
        ],
      },
      {
        nameAr: 'عصير طازج',
        nameEn: 'Fresh Juice',
        price: '12.00',
        sortOrder: 2,
      },
    ],
  },
  {
    nameAr: 'إضافات',
    nameEn: 'Sides',
    sortOrder: 2,
    items: [
      {
        nameAr: 'بطاطس مقلية',
        nameEn: 'French Fries',
        price: '10.00',
        sortOrder: 0,
      },
      {
        nameAr: 'صلصة رانش',
        nameEn: 'Ranch Sauce',
        price: '3.00',
        sortOrder: 1,
      },
    ],
  },
]

async function main() {
  const prisma = createPrisma()
  try {
    const existing = await prisma.user.findUnique({
      where: { email: DEMO_EMAIL },
      select: { id: true },
    })
    if (existing) {
      log(`Already seeded — skipping. email=${DEMO_EMAIL}`)
      return
    }

    const passwordHash = hashPassword(DEMO_PASSWORD)

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
            companyNameAr: 'مطعم تجريبي',
            companyNameEn: 'Demo Restaurant',
            crNumber: '1010000000',
            vatNumber: DEMO_VAT,
            addressAr: 'الرياض، المملكة العربية السعودية',
            addressEn: 'Riyadh, Saudi Arabia',
            streetAr: 'طريق الملك فهد',
            streetEn: 'King Fahd Road',
            districtAr: 'العليا',
            districtEn: 'Olaya',
            cityAr: 'الرياض',
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
          data: {
            userId: user.id,
            businessProfileId: profile.id,
          },
        })

        await tx.businessSettings.create({
          data: { businessProfileId: profile.id },
        })

        for (const cat of MENU) {
          const category = await tx.menuCategory.create({
            data: {
              businessProfileId: profile.id,
              nameAr: cat.nameAr,
              nameEn: cat.nameEn,
              sortOrder: cat.sortOrder,
              active: true,
            },
          })

          for (const item of cat.items) {
            const menuItem = await tx.menuItem.create({
              data: {
                businessProfileId: profile.id,
                categoryId: category.id,
                nameAr: item.nameAr,
                nameEn: item.nameEn,
                price: item.price,
                vatPreset: 'standard',
                active: true,
                sortOrder: item.sortOrder,
              },
            })

            let vgOrder = 0
            for (const group of item.variants ?? []) {
              const vg = await tx.menuItemVariantGroup.create({
                data: {
                  menuItemId: menuItem.id,
                  nameAr: group.nameAr,
                  nameEn: group.nameEn,
                  sortOrder: vgOrder++,
                },
              })
              let optOrder = 0
              for (const opt of group.options) {
                await tx.menuItemVariantOption.create({
                  data: {
                    groupId: vg.id,
                    nameAr: opt.nameAr,
                    nameEn: opt.nameEn,
                    priceChange: opt.priceChange,
                    isDefault: opt.isDefault === true,
                    sortOrder: optOrder++,
                  },
                })
              }
            }

            let custOrder = 0
            for (const cust of item.customizations ?? []) {
              await tx.menuItemCustomization.create({
                data: {
                  menuItemId: menuItem.id,
                  nameAr: cust.nameAr,
                  nameEn: cust.nameEn,
                  priceChange: cust.priceChange,
                  sortOrder: custOrder++,
                },
              })
            }
          }
        }

        log(`Created owner userId=${user.id} profileId=${profile.id}`)
      },
      { maxWait: 20_000, timeout: 120_000 },
    )

    log('Done — owner + menu seeded (no roles).')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error('[seed-demo-dev] failed:', err)
  process.exit(1)
})
