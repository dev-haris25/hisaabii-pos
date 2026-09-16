/**
 * One-shot production fix for the Brittania Roast owner account.
 *
 * 1) Rename login email numan.malik@gmail.com → brittaniabroast@gmail.com
 *    (sessions stay valid — they use user id, not email).
 * 2) Convert that owner's menu item prices and variant option extras from
 *    VAT-inclusive to ex-VAT (÷ 1.15). Customizations are not touched.
 *
 * Safe to run on every deploy: recorded in data_fixes and skipped after.
 *
 * Usage: bun scripts/one-off-brittania-owner-email-and-exvat-menu.mjs
 */
import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client.ts'
import { Pool } from 'pg'

import {
  decimalStringFromNumber,
  parseMoney,
} from '../src/lib/invoices/invoice-compute-totals.js'

const FIX_ID = '2026-09-17-brittania-owner-email-and-exvat-menu'
const FROM_EMAIL = 'numan.malik@gmail.com'
const TO_EMAIL = 'brittaniabroast@gmail.com'
const VAT_INCLUSIVE_DIVISOR = 1.15

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
  return { prisma: new PrismaClient({ adapter: new PrismaPg(pool) }), pool }
}

/** @param {string} raw */
function toExVat(raw) {
  const n = parseMoney(raw)
  if (n === 0) return decimalStringFromNumber(0)
  return decimalStringFromNumber(n / VAT_INCLUSIVE_DIVISOR)
}

async function main() {
  const { prisma, pool } = createPrisma()
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS data_fixes (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    const already = await prisma.$queryRaw`
      SELECT id FROM data_fixes WHERE id = ${FIX_ID}
    `
    if (Array.isArray(already) && already.length > 0) {
      console.info(`[${FIX_ID}] already applied — skip`)
      return
    }

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: { OR: [{ email: FROM_EMAIL }, { email: TO_EMAIL }] },
        orderBy: { createdAt: 'asc' },
      })
      if (!user) {
        throw new Error(
          `Owner user not found (${FROM_EMAIL} or ${TO_EMAIL})`,
        )
      }

      let emailChanged = false
      if (user.email === FROM_EMAIL) {
        const taken = await tx.user.findUnique({
          where: { email: TO_EMAIL },
          select: { id: true },
        })
        if (taken && taken.id !== user.id) {
          throw new Error(`${TO_EMAIL} is already used by another user`)
        }
        await tx.user.update({
          where: { id: user.id },
          data: { email: TO_EMAIL },
        })
        emailChanged = true
      }

      const businesses = await tx.businessProfile.findMany({
        where: { ownerUserId: user.id },
        select: { id: true, companyNameAr: true },
      })
      if (businesses.length === 0) {
        throw new Error(`No restaurant owned by ${user.email}`)
      }
      const businessIds = businesses.map((b) => b.id)

      const items = await tx.menuItem.findMany({
        where: { businessProfileId: { in: businessIds } },
        select: { id: true, price: true },
      })
      let itemsUpdated = 0
      for (const item of items) {
        const next = toExVat(item.price)
        if (next === item.price) continue
        await tx.menuItem.update({
          where: { id: item.id },
          data: { price: next },
        })
        itemsUpdated += 1
      }

      const variants = await tx.menuItemVariantOption.findMany({
        where: { group: { menuItem: { businessProfileId: { in: businessIds } } } },
        select: { id: true, priceChange: true },
      })
      let variantsUpdated = 0
      for (const option of variants) {
        const next = toExVat(option.priceChange)
        if (next === option.priceChange) continue
        await tx.menuItemVariantOption.update({
          where: { id: option.id },
          data: { priceChange: next },
        })
        variantsUpdated += 1
      }

      await tx.$executeRaw`
        INSERT INTO data_fixes (id) VALUES (${FIX_ID})
      `

      return {
        userId: user.id,
        emailChanged,
        restaurants: businesses.length,
        itemsUpdated,
        variantsUpdated,
        customizationsUntouched: true,
      }
    })

    console.info(`[${FIX_ID}] applied`, result)
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
