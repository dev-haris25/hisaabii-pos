import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
import {
  computeInvoiceTotals,
  decimalStringFromNumber,
  parseMoney,
  allocateOrderDiscount,
} from '@/lib/invoices/invoice-compute-totals'
import { menuItemInclude } from '@/lib/menu/map-menu-json'
import { resolveCheckoutModifiers } from '@/lib/menu/resolve-checkout-modifiers'
import { createKitchenOrderInTx } from '@/lib/orders/create-kitchen-order'
import { isDiscountWithinCap } from '@/lib/pos/discount-cap'
import { prisma } from '@/lib/prisma'
import { humanizeZatcaError } from '@/lib/zatca/humanize-zatca-error'
import { runInvoiceZatcaSend } from '@/lib/zatca/run-invoice-zatca-send'
import { emitZatcaReportFailed } from '@/lib/notifications/emit-zatca-report-failed'
import { z } from 'zod'

const moneyOptionalSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,4})?$/)
  .optional()
  .nullable()

const checkoutLineSchema = z.object({
  menuItemId: z.string().trim().min(1),
  quantity: z.number().int().min(1).max(999),
  variantOptionIds: z.array(z.string().trim().min(1)).max(40).optional().default([]),
  customizationIds: z.array(z.string().trim().min(1)).max(40).optional().default([]),
  lineNote: z.string().trim().max(300).optional().nullable(),
})

export const posCheckoutBodySchema = z.object({
  lines: z.array(checkoutLineSchema).min(1).max(100),
  paymentMethod: z.enum(['cash', 'card']),
  amountTendered: moneyOptionalSchema,
  /** Order-level discount (SAR); allocated across lines by gross share. */
  discount: moneyOptionalSchema,
  notes: z.string().trim().max(500).optional().nullable(),
})

/**
 * Human-facing POS invoice number, e.g. INV-0001.
 * @param {number | string} n
 * @param {string} [prefix]
 * @param {number} [padding]
 */
export function formatInvoiceNumber(n, prefix = 'INV-', padding = 4) {
  const num = Number.parseInt(String(n), 10)
  const pad = Math.max(1, Math.min(10, Number(padding) || 4))
  if (!Number.isFinite(num) || num < 1) {
    return `${prefix}${String(1).padStart(pad, '0')}`
  }
  return `${prefix}${String(num).padStart(pad, '0')}`
}

/**
 * Atomically allocate the next sequential invoice number for a restaurant.
 * @param {string} businessProfileId
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx
 * @returns {Promise<string>} e.g. INV-0001
 */
async function allocateInvoiceNumber(businessProfileId, tx) {
  const settings = await tx.businessSettings.findUnique({
    where: { businessProfileId },
    select: { invoicePrefix: true, numberPadding: true },
  })
  const row = await tx.invoiceCounter.upsert({
    where: { businessProfileId },
    create: { businessProfileId, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
    select: { lastNumber: true },
  })
  return formatInvoiceNumber(
    row.lastNumber,
    settings?.invoicePrefix || 'INV-',
    settings?.numberPadding ?? 4,
  )
}

/**
 * Create completed simplified invoice, sign + report to ZATCA (Phase-2 QR).
 *
 * @param {{
 *   profileId: string
 *   staffId: string
 *   body: z.infer<typeof posCheckoutBodySchema>
 * }} opts
 */
export async function checkoutPosSale({ profileId, staffId, body }) {
  const profile = await prisma.businessProfile.findUnique({
    where: { id: profileId },
  })
  if (!profile?.onboardingCompletedAt) {
    throw Object.assign(new Error('Restaurant profile incomplete'), {
      code: 'BUSINESS_PROFILE_REQUIRED',
    })
  }

  const device = await prisma.zatcaDevice.findUnique({
    where: { businessProfileId: profileId },
  })
  if (!device?.productionCsid) {
    throw Object.assign(new Error('ZATCA not onboarded'), {
      code: 'ZATCA_NOT_ONBOARDED',
    })
  }

  const itemIds = [...new Set(body.lines.map((l) => l.menuItemId))]
  const menuItems = await prisma.menuItem.findMany({
    where: {
      id: { in: itemIds },
      businessProfileId: profileId,
      active: true,
    },
    include: menuItemInclude,
  })
  /** @type {Map<string, (typeof menuItems)[number]>} */
  const byId = new Map(menuItems.map((m) => [m.id, m]))
  for (const line of body.lines) {
    if (!byId.has(line.menuItemId)) {
      throw Object.assign(new Error('Invalid menu item'), {
        code: 'INVALID_MENU_ITEM',
      })
    }
  }

  const pricedLines = body.lines.map((l) => {
    const item = byId.get(l.menuItemId)
    const resolved = resolveCheckoutModifiers(
      item,
      l.variantOptionIds,
      l.customizationIds,
    )
    return {
      quantity: l.quantity,
      unitPrice: resolved.unitPrice,
      vatPreset: item.vatPreset,
      modifiersSnapshot: resolved.modifiersSnapshot,
      lineNote: l.lineNote?.trim() || null,
    }
  })
  const baseLines = pricedLines.map((l) => ({
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    vatPreset: l.vatPreset,
  }))
  const settings = await prisma.businessSettings.findUnique({
    where: { businessProfileId: profileId },
    select: { discountCap: true },
  })
  if (!isDiscountWithinCap(body.discount ?? '0', settings?.discountCap)) {
    throw Object.assign(new Error('Discount exceeds restaurant cap'), {
      code: 'DISCOUNT_EXCEEDS_CAP',
    })
  }

  const lineDiscounts = allocateOrderDiscount(baseLines, body.discount ?? '0')
  const computeInput = baseLines.map((l, i) => ({
    ...l,
    discount: lineDiscounts[i],
  }))
  const totals = computeInvoiceTotals(computeInput)

  if (body.paymentMethod === 'cash') {
    const tendered = parseMoney(body.amountTendered)
    const grand = parseMoney(totals.grandTotal)
    if (!body.amountTendered || tendered < grand) {
      throw Object.assign(new Error('Insufficient tender'), {
        code: 'INSUFFICIENT_TENDER',
      })
    }
  }

  const changeGiven =
    body.paymentMethod === 'cash'
      ? decimalStringFromNumber(
          parseMoney(body.amountTendered) - parseMoney(totals.grandTotal),
        )
      : null

  const invoice = await prisma.$transaction(async (tx) => {
    const invoiceNumber = await allocateInvoiceNumber(profileId, tx)
    const created = await tx.invoice.create({
      data: {
        businessProfileId: profileId,
        invoiceNumber,
        status: 'completed',
        type: 'simplified',
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
        sellerEmail: profile.email?.trim() || null,
        sellerPhone: profile.phone?.trim() || null,
        paymentMethod: body.paymentMethod,
        amountTendered:
          body.paymentMethod === 'cash' ? body.amountTendered : null,
        changeGiven,
        subtotal: totals.subtotal,
        totalVat: totals.totalVat,
        grandTotal: totals.grandTotal,
        notes: body.notes?.trim() || null,
        zatcaStatus: 'pending',
        lines: {
          create: body.lines.map((l, idx) => {
            const item = byId.get(l.menuItemId)
            const priced = pricedLines[idx]
            const a = totals.perLine[idx]
            return {
              menuItemId: item.id,
              nameAr: item.nameAr,
              nameEn: item.nameEn,
              quantity: a.quantity,
              unitPrice: priced.unitPrice,
              discount: a.discountStr,
              vatPreset: item.vatPreset,
              vatAmount: a.vatAmountStr,
              lineTotal: a.lineTotalStr,
              sortOrder: idx,
              lineNote: null,
              modifiersSnapshot: priced.modifiersSnapshot,
            }
          }),
        },
      },
      include: { lines: true },
    })
    await createKitchenOrderInTx(tx, {
      businessProfileId: profileId,
      invoiceId: created.id,
      lines: body.lines.map((l, idx) => {
        const item = byId.get(l.menuItemId)
        const priced = pricedLines[idx]
        return {
          nameAr: item.nameAr,
          nameEn: item.nameEn,
          quantity: priced.quantity,
          lineNote: priced.lineNote,
          modifiersSnapshot: priced.modifiersSnapshot,
        }
      }),
    })
    return created
  }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)

  try {
    await runInvoiceZatcaSend({
      invoice,
      device,
      selectedEnvironment: profile.zatcaEnvironment,
    })
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        zatcaReportAttempts: { increment: 1 },
        zatcaLastAttemptAt: new Date(),
        zatcaLastError: null,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const humanized = humanizeZatcaError(msg)
    const first = humanized.issues?.[0]
    const summary = first?.message
      ? [first.title, first.message, first.actionHint]
          .filter(Boolean)
          .join(' — ')
      : msg
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        zatcaStatus: 'failed',
        zatcaReportAttempts: { increment: 1 },
        zatcaLastAttemptAt: new Date(),
        zatcaLastError: summary.slice(0, 1000),
      },
    })
    void emitZatcaReportFailed({
      businessProfileId: profileId,
      actorUserId: staffId,
      documentKind: 'invoice',
      documentId: invoice.id,
      documentNumber: invoice.invoiceNumber,
    })
    throw Object.assign(new Error(msg), {
      code: 'ZATCA_ERROR',
      invoiceId: invoice.id,
    })
  }

  const fresh = await prisma.invoice.findUnique({
    where: { id: invoice.id },
    include: {
      lines: { orderBy: { sortOrder: 'asc' } },
      kitchenOrder: { select: { orderNumber: true, status: true } },
    },
  })
  return fresh
}
