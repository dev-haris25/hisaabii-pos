import { DEFAULT_COMPLIANCE_PREVIOUS_INVOICE_HASH } from '@talha7k/zatca'

import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
import { extractQrTlvBase64FromInvoiceXml } from '@/lib/invoices/extract-qr-from-xml'
import { prisma } from '@/lib/prisma'
import { signStoredInvoiceForZatca } from '@/lib/zatca/submit-invoice'
import { signStoredNoteForZatca } from '@/lib/zatca/submit-note-to-zatca'
import { submitSignedDocumentToZatca } from '@/lib/zatca/submit-signed-document'
import { zatcaAttemptErrorSummary } from '@/lib/zatca/zatca-attempt-error-summary'
import { loadZatcaSigningContext } from '@/lib/zatca/zatca-signing-context'

/**
 * One hash chain per restaurant, shared by invoices and credit/debit notes
 * (rules §18 / §24). Every document goes through two steps:
 *
 *  1. `signDocumentIntoChain` — under a row lock on the restaurant's
 *     ZatcaDevice: sign with counter+1 / PIH = tip, persist the signed XML,
 *     XML and hash on the document, advance the tip. Concurrent checkouts and
 *     notes queue on the lock, so no two documents share a counter or PIH.
 *     A document that is already signed is never signed again.
 *  2. `submitSignedDocumentToZatca` — HTTP outside the lock, always sending the
 *     stored signed XML. Retries resend the identical document (same UUID/hash).
 *
 * `qrCode` is written only once ZATCA accepts the document, so "has a QR"
 * keeps meaning "reported" for receipt printing / PDF (that code is unchanged).
 *
 * @typedef {'invoice' | 'credit' | 'debit'} ZatcaDocumentKind
 */

/**
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof prisma} client
 * @param {ZatcaDocumentKind} kind
 */
function delegateFor(client, kind) {
  if (kind === 'invoice') return client.invoice
  if (kind === 'credit') return client.creditNote
  return client.debitNote
}

/**
 * @param {ZatcaDocumentKind} kind
 * @param {{ invoiceNumber?: string, creditNoteNumber?: string, debitNoteNumber?: string }} doc
 */
function documentLabel(kind, doc) {
  if (kind === 'invoice') return doc.invoiceNumber ?? 'invoice'
  if (kind === 'credit') return doc.creditNoteNumber ?? 'credit note'
  return doc.debitNoteNumber ?? 'debit note'
}

/**
 * Row-lock the document so an in-place repair cannot change its lines while it
 * is being signed (repairs re-check "unsigned" under the same lock).
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx
 * @param {ZatcaDocumentKind} kind
 * @param {string} id
 */
async function lockDocumentRow(tx, kind, id) {
  if (kind === 'invoice') {
    await tx.$queryRaw`SELECT "id" FROM "invoices" WHERE "id" = ${id} FOR UPDATE`
  } else if (kind === 'credit') {
    await tx.$queryRaw`SELECT "id" FROM "credit_notes" WHERE "id" = ${id} FOR UPDATE`
  } else {
    await tx.$queryRaw`SELECT "id" FROM "debit_notes" WHERE "id" = ${id} FOR UPDATE`
  }
}

/**
 * Inside a repair transaction: lock the document and confirm it was never
 * signed. Returns false when it was signed meanwhile (caller must refuse).
 *
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient} tx
 * @param {ZatcaDocumentKind} kind
 * @param {string} id
 */
export async function lockUnsignedDocumentForRepair(tx, kind, id) {
  await lockDocumentRow(tx, kind, id)
  const row = await delegateFor(tx, kind).findUnique({
    where: { id },
    select: { xmlPayload: true, cryptographicStamp: true },
  })
  return Boolean(row) && !isZatcaDocumentSigned(row)
}

/**
 * @param {{ xmlPayload?: string | null, cryptographicStamp?: string | null }} doc
 */
export function isZatcaDocumentSigned(doc) {
  return Boolean(
    doc &&
      typeof doc.xmlPayload === 'string' &&
      doc.xmlPayload.trim() &&
      typeof doc.cryptographicStamp === 'string' &&
      doc.cryptographicStamp.trim(),
  )
}

/**
 * Sign a document into the restaurant's chain (idempotent).
 *
 * @param {{ kind: ZatcaDocumentKind, id: string, businessProfileId: string }} opts
 * @returns {Promise<{ document: Record<string, any>, device: import('@/generated/prisma/client').ZatcaDevice }>}
 */
export async function signDocumentIntoChain({ kind, id, businessProfileId }) {
  return prisma.$transaction(async (tx) => {
    // Serialize every signer for this restaurant on the device row.
    await tx.$queryRaw`SELECT "id" FROM "zatca_devices" WHERE "businessProfileId" = ${businessProfileId} FOR UPDATE`

    const device = await tx.zatcaDevice.findUnique({
      where: { businessProfileId },
    })
    if (!device?.productionCsid || !device.productionSecretEnc) {
      throw Object.assign(new Error('Complete ZATCA onboarding first'), {
        code: 'ZATCA_NOT_ONBOARDED',
      })
    }

    await lockDocumentRow(tx, kind, id)

    const document = await delegateFor(tx, kind).findFirst({
      where: { id, businessProfileId },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    })
    if (!document) {
      throw Object.assign(new Error('Document not found'), { code: 'NOT_FOUND' })
    }
    if (isZatcaDocumentSigned(document)) {
      return { document, device }
    }

    const ctx = loadZatcaSigningContext(device)
    const previousTip = device.lastInvoiceHash?.trim() || ''
    const chain = {
      invoiceCounter: device.invoiceCounter + 1,
      previousInvoiceHash: previousTip || DEFAULT_COMPLIANCE_PREVIOUS_INVOICE_HASH,
    }
    const signed =
      kind === 'invoice'
        ? signStoredInvoiceForZatca(document, ctx, chain)
        : signStoredNoteForZatca(document, ctx, kind, chain)

    const updatedDevice = await tx.zatcaDevice.update({
      where: { businessProfileId },
      data: {
        invoiceCounter: chain.invoiceCounter,
        lastInvoiceHash: signed.invoiceHash,
      },
    })
    const updatedDocument = await delegateFor(tx, kind).update({
      where: { id },
      data: {
        xmlPayload: signed.signedXml,
        cryptographicStamp: signed.invoiceHash,
        pih: previousTip || null,
      },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    })

    return { document: updatedDocument, device: updatedDevice }
  }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)
}

/**
 * Sign (if needed) and report one document, recording the attempt.
 * On failure the document is marked `failed` with a human-readable summary and
 * an error with `code: 'ZATCA_ERROR'` (plus `zatcaSummary`) is thrown.
 * Signing failures (e.g. incomplete seller data) leave the chain untouched.
 *
 * @param {{
 *   kind: ZatcaDocumentKind
 *   id: string
 *   businessProfileId: string
 *   withTransientRetry?: boolean
 * }} opts
 */
export async function reportDocumentToZatca({
  kind,
  id,
  businessProfileId,
  withTransientRetry = false,
}) {
  const attemptAt = new Date()
  try {
    const { document, device } = await signDocumentIntoChain({
      kind,
      id,
      businessProfileId,
    })
    await submitSignedDocumentToZatca(document, device, {
      label: documentLabel(kind, document),
      withTransientRetry,
    })
    await delegateFor(prisma, kind).update({
      where: { id },
      data: {
        qrCode: extractQrTlvBase64FromInvoiceXml(document.xmlPayload),
        zatcaStatus: 'reported',
        zatcaClearedAt: new Date(),
        zatcaReportAttempts: { increment: 1 },
        zatcaLastAttemptAt: attemptAt,
        zatcaLastError: null,
      },
    })
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'NOT_FOUND') {
      throw err
    }
    const summary = zatcaAttemptErrorSummary(err)
    await delegateFor(prisma, kind).update({
      where: { id },
      data: {
        zatcaStatus: 'failed',
        zatcaReportAttempts: { increment: 1 },
        zatcaLastAttemptAt: attemptAt,
        zatcaLastError: summary,
      },
    })
    console.error(`[zatca] report ${kind} ${id} failed:`, err)
    throw Object.assign(new Error(summary), {
      code: 'ZATCA_ERROR',
      zatcaSummary: summary,
      cause: err,
    })
  }
}
