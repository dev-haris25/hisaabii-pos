/**
 * Seed sandbox POS orders for Haris Restaurant (haris@gmail.com).
 * Last 3 months, existing menu only, zatcaStatus = reported + Phase-1 TLV QR.
 *
 * Usage: bun scripts/seed-haris-orders.mjs
 */
import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client.ts'
import { Pool } from 'pg'

import {
  computeInvoiceTotals,
  decimalStringFromNumber,
  parseMoney,
} from '../src/lib/invoices/invoice-compute-totals.js'

const EMAIL = 'haris@gmail.com'
const RESTAURANT_NAME_RE = /haris/i
const DAYS = 90
const MIN_ORDERS_PER_DAY = 2
const MAX_ORDERS_PER_DAY = 5
const SEED_NOTE = 'SEED_HARIS_ORDERS_V1'

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

/** @param {number} n */
function formatInvoiceNumber(n, prefix = 'INV-', padding = 4) {
  return `${prefix}${String(n).padStart(padding, '0')}`
}

/**
 * @param {number} tag
 * @param {string} value
 */
function tlvTag(tag, value) {
  const buf = Buffer.from(String(value ?? ''), 'utf8')
  if (buf.length > 255) {
    return Buffer.concat([
      Buffer.from([tag, 255]),
      buf.subarray(0, 255),
    ])
  }
  return Buffer.concat([Buffer.from([tag, buf.length]), buf])
}

/**
 * Phase-1 ZATCA TLV (tags 1–5) as base64 — enough for on-screen / print QR.
 *
 * @param {{
 *   sellerName: string
 *   vatNumber: string
 *   timestamp: Date
 *   grandTotal: string
 *   totalVat: string
 * }} opts
 */
function buildSandboxQrPayload(opts) {
  const payload = Buffer.concat([
    tlvTag(1, opts.sellerName),
    tlvTag(2, opts.vatNumber),
    tlvTag(3, opts.timestamp.toISOString()),
    tlvTag(4, opts.grandTotal),
    tlvTag(5, opts.totalVat),
  ])
  return payload.toString('base64')
}

/** @param {number} min @param {number} max */
function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1))
}

/** @template T @param {T[]} arr */
function pick(arr) {
  return arr[randInt(0, arr.length - 1)]
}

/**
 * @param {import('../src/generated/prisma/client.ts').PrismaClient} prisma
 * @param {string} businessProfileId
 * @param {string} prefix
 * @param {number} padding
 */
async function allocateInvoiceNumber(prisma, businessProfileId, prefix, padding) {
  const row = await prisma.invoiceCounter.upsert({
    where: { businessProfileId },
    create: { businessProfileId, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
    select: { lastNumber: true },
  })
  return formatInvoiceNumber(row.lastNumber, prefix, padding)
}

/**
 * @param {Date} dayStart
 */
function randomTimeOnDay(dayStart) {
  const d = new Date(dayStart)
  d.setHours(randInt(10, 22), randInt(0, 59), randInt(0, 59), 0)
  return d
}

async function main() {
  const prisma = createPrisma()
  try {
    const user = await prisma.user.findFirst({
      where: { email: EMAIL, active: true },
      select: { id: true, name: true, email: true },
    })
    if (!user) {
      throw new Error(`No active user found for ${EMAIL}`)
    }

    const profiles = await prisma.businessProfile.findMany({
      where: {
        OR: [
          { ownerUserId: user.id },
          { memberships: { some: { userId: user.id } } },
        ],
      },
      select: {
        id: true,
        companyNameAr: true,
        companyNameEn: true,
        vatNumber: true,
        crNumber: true,
        addressAr: true,
        addressEn: true,
        streetAr: true,
        streetEn: true,
        districtAr: true,
        districtEn: true,
        cityAr: true,
        cityEn: true,
        buildingNumber: true,
        secondaryNumber: true,
        postalCode: true,
        shortAddress: true,
        email: true,
        phone: true,
      },
    })

    const profile = profiles.find(
      (p) =>
        RESTAURANT_NAME_RE.test(p.companyNameEn ?? '') ||
        RESTAURANT_NAME_RE.test(p.companyNameAr ?? ''),
    )
    if (!profile) {
      const names = profiles
        .map((p) => p.companyNameEn || p.companyNameAr)
        .join(', ')
      throw new Error(
        `No restaurant matching /haris/i for ${EMAIL}. Found: ${names || '(none)'}`,
      )
    }

    const settings = await prisma.businessSettings.findUnique({
      where: { businessProfileId: profile.id },
      select: { invoicePrefix: true, numberPadding: true },
    })
    const prefix = settings?.invoicePrefix || 'INV-'
    const padding = settings?.numberPadding ?? 4

    const menuItems = await prisma.menuItem.findMany({
      where: { businessProfileId: profile.id, active: true },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        nameAr: true,
        nameEn: true,
        price: true,
        vatPreset: true,
      },
    })
    if (menuItems.length === 0) {
      throw new Error(`No active menu items for restaurant ${profile.id}`)
    }

    console.log(
      `Seeding orders for ${profile.companyNameEn || profile.companyNameAr} (${profile.id})`,
    )
    console.log(`Staff: ${user.name} <${user.email}>`)
    console.log(
      `Menu (${menuItems.length}): ${menuItems.map((m) => m.nameEn || m.nameAr).join(', ')}`,
    )

    const sellerName = profile.companyNameAr || profile.companyNameEn || 'Haris'
    let createdCount = 0
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (let dayOffset = DAYS - 1; dayOffset >= 0; dayOffset--) {
      const dayStart = new Date(today)
      dayStart.setDate(dayStart.getDate() - dayOffset)
      const ordersToday = randInt(MIN_ORDERS_PER_DAY, MAX_ORDERS_PER_DAY)

      for (let i = 0; i < ordersToday; i++) {
        const invoiceDate = randomTimeOnDay(dayStart)
        const lineCount = randInt(1, Math.min(3, menuItems.length))
        const used = new Set()
        /** @type {typeof menuItems} */
        const picked = []
        while (picked.length < lineCount) {
          const item = pick(menuItems)
          if (used.has(item.id) && used.size < menuItems.length) continue
          used.add(item.id)
          picked.push(item)
        }

        const computeInput = picked.map((item) => ({
          quantity: randInt(1, 4),
          unitPrice: String(item.price),
          discount: '0.00',
          vatPreset: item.vatPreset,
        }))
        const totals = computeInvoiceTotals(computeInput)
        const grand = parseMoney(totals.grandTotal)
        const paymentMethod = Math.random() < 0.55 ? 'cash' : 'card'
        const tendered =
          paymentMethod === 'cash'
            ? decimalStringFromNumber(grand + randInt(0, 50))
            : null
        const changeGiven =
          paymentMethod === 'cash' && tendered
            ? decimalStringFromNumber(parseMoney(tendered) - grand)
            : null

        const invoiceNumber = await allocateInvoiceNumber(
          prisma,
          profile.id,
          prefix,
          padding,
        )
        const qrCode = buildSandboxQrPayload({
          sellerName,
          vatNumber: profile.vatNumber,
          timestamp: invoiceDate,
          grandTotal: totals.grandTotal,
          totalVat: totals.totalVat,
        })
        const stamp = Buffer.from(`${invoiceNumber}:${invoiceDate.toISOString()}`)
          .toString('hex')
          .slice(0, 64)
          .padEnd(64, '0')

        await prisma.invoice.create({
          data: {
            businessProfileId: profile.id,
            invoiceNumber,
            status: 'completed',
            type: 'simplified',
            invoiceDate,
            createdAt: invoiceDate,
            updatedAt: invoiceDate,
            createdByStaffId: user.id,
            sellerCompanyNameAr: profile.companyNameAr,
            sellerCompanyNameEn: profile.companyNameEn,
            sellerVatNumber: profile.vatNumber,
            sellerCrNumber: profile.crNumber,
            sellerAddressAr: profile.addressAr,
            sellerAddressEn: profile.addressEn,
            sellerStreetAr: profile.streetAr,
            sellerStreetEn: profile.streetEn,
            sellerDistrictAr: profile.districtAr,
            sellerDistrictEn: profile.districtEn,
            sellerCityAr: profile.cityAr,
            sellerCityEn: profile.cityEn,
            sellerBuildingNumber: profile.buildingNumber,
            sellerSecondaryNumber: profile.secondaryNumber,
            sellerPostalCode: profile.postalCode,
            sellerShortAddress: profile.shortAddress,
            sellerEmail: profile.email,
            sellerPhone: profile.phone,
            paymentMethod,
            amountTendered: tendered,
            changeGiven,
            subtotal: totals.subtotal,
            totalVat: totals.totalVat,
            grandTotal: totals.grandTotal,
            notes: SEED_NOTE,
            qrCode,
            cryptographicStamp: stamp,
            pih: stamp,
            zatcaStatus: 'reported',
            zatcaClearedAt: invoiceDate,
            zatcaReportAttempts: 1,
            zatcaLastAttemptAt: invoiceDate,
            zatcaLastError: null,
            lines: {
              create: picked.map((item, idx) => {
                const a = totals.perLine[idx]
                return {
                  menuItemId: item.id,
                  nameAr: item.nameAr,
                  nameEn: item.nameEn,
                  quantity: a.quantity,
                  unitPrice: String(item.price),
                  discount: a.discountStr,
                  vatPreset: item.vatPreset,
                  vatAmount: a.vatAmountStr,
                  lineTotal: a.lineTotalStr,
                  sortOrder: idx,
                }
              }),
            },
          },
        })
        createdCount += 1
      }
    }

    console.log(`Done. Created ${createdCount} reported invoices over ${DAYS} days.`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
