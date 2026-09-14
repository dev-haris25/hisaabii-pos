import { prisma } from '@/lib/prisma'

/** @typedef {import('@/generated/prisma').BusinessSettings} BusinessSettings */

/**
 * @param {string} businessProfileId
 * @param {import('@/generated/prisma').Prisma.TransactionClient | typeof prisma} [db]
 */
export async function getOrCreateBusinessSettings(businessProfileId, db = prisma) {
  const existing = await db.businessSettings.findUnique({
    where: { businessProfileId },
  })
  if (existing) return existing
  return db.businessSettings.create({
    data: { businessProfileId },
  })
}

/**
 * @param {BusinessSettings | null | undefined} settings
 */
export function documentNumberingFromSettings(settings) {
  return {
    invoicePrefix: settings?.invoicePrefix || 'INV-',
    creditNotePrefix: settings?.creditNotePrefix || 'CN-',
    debitNotePrefix: settings?.debitNotePrefix || 'DN-',
    salarySlipPrefix: settings?.salarySlipPrefix || 'SS-',
    numberPadding: Math.max(1, Math.min(10, settings?.numberPadding ?? 4)),
  }
}
