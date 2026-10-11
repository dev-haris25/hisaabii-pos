import { computeInvoiceOutstanding } from '@/lib/notes/invoice-outstanding'

/**
 * Non-deleted credit / debit notes of an invoice with their lines.
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | import('@/generated/prisma/client').PrismaClient} db
 * @param {string} invoiceId
 */
export async function loadInvoiceNotes(db, invoiceId) {
  const [creditNotes, debitNotes] = await Promise.all([
    db.creditNote.findMany({
      where: { invoiceId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    }),
    db.debitNote.findMany({
      where: { invoiceId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    }),
  ])
  return { creditNotes, debitNotes }
}

/**
 * Outstanding state of an invoice from the database (see invoice-outstanding.js).
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | import('@/generated/prisma/client').PrismaClient} db
 * @param {{ id: string, lines: import('@/generated/prisma/client').InvoiceLine[] }} invoice
 */
export async function loadInvoiceOutstanding(db, invoice) {
  const { creditNotes, debitNotes } = await loadInvoiceNotes(db, invoice.id)
  return computeInvoiceOutstanding({
    invoiceLines: invoice.lines,
    creditNotes,
    debitNotes,
  })
}

/**
 * Row-lock the invoice for the rest of the transaction so two corrections /
 * cancellations of one invoice run one after the other.
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx
 * @param {string} invoiceId
 * @param {string} businessProfileId
 */
export async function lockInvoiceRow(tx, invoiceId, businessProfileId) {
  const rows = await tx.$queryRaw`SELECT "id" FROM "invoices" WHERE "id" = ${invoiceId} AND "businessProfileId" = ${businessProfileId} FOR UPDATE`
  return rows.length > 0
}
