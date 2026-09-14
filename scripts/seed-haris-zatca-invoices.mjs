/**
 * One-off: seed haris@gmail.com restaurant with 2 pending + 2 failed ZATCA invoices.
 * Usage: bun scripts/seed-haris-zatca-invoices.mjs
 */
import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client.ts'
import { Pool } from 'pg'

const EMAIL = 'haris@gmail.com'

/** @param {string} raw */
function connectionStringForPool(raw) {
  const s = raw.replace(/([?&])sslmode=[^&]*/gi, '$1')
  return s.replace(/\?&/, '?').replace(/[?&]$/, '')
}

/** @param {number} n */
function formatInvoiceNumber(n, prefix = 'INV-', padding = 4) {
  return `${prefix}${String(n).padStart(padding, '0')}`
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

/**
 * @param {import('../src/generated/prisma/client.ts').PrismaClient} prisma
 * @param {string} businessProfileId
 */
async function allocateInvoiceNumber(prisma, businessProfileId) {
  const row = await prisma.invoiceCounter.upsert({
    where: { businessProfileId },
    create: { businessProfileId, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
    select: { lastNumber: true },
  })
  return formatInvoiceNumber(row.lastNumber)
}

/**
 * @param {import('../src/generated/prisma/client.ts').PrismaClient} prisma
 * @param {{
 *   profile: {
 *     id: string
 *     companyNameAr: string
 *     companyNameEn: string | null
 *     vatNumber: string
 *     crNumber: string
 *     addressAr: string
 *     addressEn: string | null
 *     streetAr: string
 *     streetEn: string
 *     districtAr: string
 *     districtEn: string
 *     cityAr: string
 *     cityEn: string
 *     buildingNumber: string
 *     secondaryNumber: string
 *     postalCode: string
 *     shortAddress: string
 *   }
 *   staffId: string
 *   menuItem: {
 *     id: string
 *     nameAr: string
 *     nameEn: string | null
 *     price: string
 *     vatPreset: 'standard' | 'zero' | 'exempt'
 *   } | null
 *   zatcaStatus: 'pending' | 'failed'
 *   paymentMethod: 'cash' | 'card'
 *   label: string
 * }} opts
 */
async function createSeedInvoice(prisma, opts) {
  const { profile, staffId, menuItem, zatcaStatus, paymentMethod, label } = opts
  const invoiceNumber = await allocateInvoiceNumber(prisma, profile.id)

  const unitPrice = menuItem?.price ?? '25.00'
  const qty = 2
  const unit = Number.parseFloat(unitPrice)
  const vatPreset = menuItem?.vatPreset ?? 'standard'
  const vatRate = vatPreset === 'standard' ? 0.15 : 0
  const lineNet = Math.round(unit * qty * 100) / 100
  const vatAmount = Math.round(lineNet * vatRate * 100) / 100
  const lineTotal = Math.round((lineNet + vatAmount) * 100) / 100
  const money = (n) => n.toFixed(2)

  const hoursAgo =
    zatcaStatus === 'pending'
      ? label.includes('1')
        ? 2
        : 5
      : label.includes('1')
        ? 8
        : 12

  const invoiceDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000)

  const created = await prisma.invoice.create({
    data: {
      businessProfileId: profile.id,
      invoiceNumber,
      status: 'completed',
      type: 'simplified',
      invoiceDate,
      createdByStaffId: staffId,
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
      paymentMethod,
      amountTendered: paymentMethod === 'cash' ? money(lineTotal + 10) : null,
      changeGiven: paymentMethod === 'cash' ? '10.00' : null,
      subtotal: money(lineNet),
      totalVat: money(vatAmount),
      grandTotal: money(lineTotal),
      notes: `Seed ${label}`,
      qrCode: null,
      zatcaStatus,
      zatcaReportAttempts: zatcaStatus === 'failed' ? 3 : 0,
      zatcaLastAttemptAt: zatcaStatus === 'failed' ? invoiceDate : null,
      zatcaLastError:
        zatcaStatus === 'failed'
          ? 'Seeded failure — ZATCA reporting failed (test data). Re-report when ready.'
          : null,
      lines: {
        create: [
          {
            menuItemId: menuItem?.id ?? null,
            nameAr: menuItem?.nameAr ?? 'وجبة تجريبية',
            nameEn: menuItem?.nameEn ?? 'Seed meal',
            quantity: qty,
            unitPrice: money(unit),
            discount: '0.00',
            vatPreset,
            vatAmount: money(vatAmount),
            lineTotal: money(lineTotal),
            sortOrder: 0,
          },
        ],
      },
    },
    select: { id: true, invoiceNumber: true, zatcaStatus: true },
  })

  return created
}

async function main() {
  const prisma = createPrisma()
  try {
    const staff = await prisma.user.findFirst({
      where: { email: EMAIL, active: true },
      select: {
        id: true,
        name: true,
        role: true,
        businessProfileId: true,
        businessProfile: {
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
          },
        },
      },
    })

    if (!staff?.businessProfile) {
      throw new Error(`No active staff/restaurant found for ${EMAIL}`)
    }

    const menuItem = await prisma.menuItem.findFirst({
      where: {
        businessProfileId: staff.businessProfileId,
        active: true,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        nameAr: true,
        nameEn: true,
        price: true,
        vatPreset: true,
      },
    })

    console.log(
      `Seeding restaurant ${staff.businessProfile.companyNameAr} (${staff.businessProfileId}) as ${staff.name}`,
    )
    if (menuItem) {
      console.log(`Using menu item: ${menuItem.nameAr} @ ${menuItem.price}`)
    } else {
      console.log('No menu item found — using synthetic line items')
    }

    const specs = [
      { zatcaStatus: /** @type {const} */ ('pending'), paymentMethod: /** @type {const} */ ('cash'), label: 'pending-1' },
      { zatcaStatus: /** @type {const} */ ('pending'), paymentMethod: /** @type {const} */ ('card'), label: 'pending-2' },
      { zatcaStatus: /** @type {const} */ ('failed'), paymentMethod: /** @type {const} */ ('cash'), label: 'failed-1' },
      { zatcaStatus: /** @type {const} */ ('failed'), paymentMethod: /** @type {const} */ ('card'), label: 'failed-2' },
    ]

    const created = []
    for (const spec of specs) {
      const inv = await createSeedInvoice(prisma, {
        profile: staff.businessProfile,
        staffId: staff.id,
        menuItem,
        ...spec,
      })
      created.push(inv)
      console.log(`  ${inv.invoiceNumber} → ${inv.zatcaStatus}`)
    }

    console.log(`Done. Created ${created.length} invoices.`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
