import { formatNoteNumber } from '@/lib/notes/format-note-number'

/**
 * @param {string} businessProfileId
 * @param {import('@/generated/prisma').Prisma.TransactionClient} tx
 * @returns {Promise<string>} e.g. CN-0001
 */
export async function allocateCreditNoteNumber(businessProfileId, tx) {
  const settings = await tx.businessSettings.findUnique({
    where: { businessProfileId },
    select: { creditNotePrefix: true, numberPadding: true },
  })
  const row = await tx.creditNoteCounter.upsert({
    where: { businessProfileId },
    create: { businessProfileId, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
    select: { lastNumber: true },
  })
  return formatNoteNumber(
    row.lastNumber,
    settings?.creditNotePrefix || 'CN-',
    settings?.numberPadding ?? 4,
  )
}

/**
 * @param {string} businessProfileId
 * @param {import('@/generated/prisma').Prisma.TransactionClient} tx
 * @returns {Promise<string>} e.g. DN-0001
 */
export async function allocateDebitNoteNumber(businessProfileId, tx) {
  const settings = await tx.businessSettings.findUnique({
    where: { businessProfileId },
    select: { debitNotePrefix: true, numberPadding: true },
  })
  const row = await tx.debitNoteCounter.upsert({
    where: { businessProfileId },
    create: { businessProfileId, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
    select: { lastNumber: true },
  })
  return formatNoteNumber(
    row.lastNumber,
    settings?.debitNotePrefix || 'DN-',
    settings?.numberPadding ?? 4,
  )
}
