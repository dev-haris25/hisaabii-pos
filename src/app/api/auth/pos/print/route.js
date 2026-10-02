import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import {
  cashierWindowForbiddenResponse,
  sessionNeedsCashierDocumentWindow,
} from '@/lib/auth/require-invoice-restaurant'
import { requirePosRestaurant } from '@/lib/auth/require-pos-app-user'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { buildReceiptPayloadFromInvoice } from '@/lib/print/build-receipt-from-invoice'
import { buildReceiptPayloadFromNote } from '@/lib/print/build-receipt-from-note'
import { loadReceiptLogoPngBase64 } from '@/lib/print/load-receipt-logo'
import { primaryKitchenOrderInclude } from '@/lib/orders/primary-kitchen-order'
import {
  RECEIPT_COPY_KINDS,
  receiptCopyLabel,
} from '@/lib/print/receipt-copy-labels'
import { buildEscposBuffer } from '@/lib/print/build-escpos-buffer'
import { prisma } from '@/lib/prisma'

const bodySchema = z
  .object({
    invoiceId: z.string().trim().min(1).optional(),
    noteId: z.string().trim().min(1).optional(),
    noteType: z.enum(['credit', 'debit']).optional(),
  })
  .refine(
    (b) =>
      Boolean(b.invoiceId) ||
      (Boolean(b.noteId) && Boolean(b.noteType)),
    { message: 'Provide invoiceId or noteId+noteType' },
  )

export async function POST(request) {
  try {
    const auth = await requirePosRestaurant()
    if (auth.error) return auth.error

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const profile = await prisma.businessProfile.findUnique({
      where: { id: auth.profileId },
      select: {
        logoStoragePath: true,
      },
    })
    const locale = auth.session.preferredLocale === 'ar' ? 'ar' : 'en'
    const logoPngBase64 = await loadReceiptLogoPngBase64(profile)

    /** @type {ReturnType<typeof buildReceiptPayloadFromInvoice>} */
    let receipt

    try {
      if (parsed.data.invoiceId) {
        const invoice = await prisma.invoice.findFirst({
          where: {
            id: parsed.data.invoiceId,
            businessProfileId: auth.profileId,
            ...WHERE_NOT_DELETED,
          },
          include: {
            lines: { orderBy: { sortOrder: 'asc' } },
            createdByStaff: { select: { name: true } },
            kitchenOrders: primaryKitchenOrderInclude({ withStatus: false }),
          },
        })
        if (!invoice) {
          return jsonError(404, 'NOT_FOUND', 'Invoice not found')
        }
        {
          const windowErr = cashierWindowForbiddenResponse(
            sessionNeedsCashierDocumentWindow(auth.session),
            invoice.invoiceDate,
          )
          if (windowErr) return windowErr
        }
        if (invoice.status === 'voided') {
          return jsonError(
            409,
            'INVOICE_VOIDED',
            'Cancelled invoices cannot be printed',
          )
        }
        if (!invoice.qrCode?.trim()) {
          return jsonError(
            409,
            'QR_REQUIRED',
            'Wait for ZATCA reporting before printing',
          )
        }
        receipt = buildReceiptPayloadFromInvoice({
          invoice,
          locale,
          logoPngBase64,
        })
      } else {
        const noteType = parsed.data.noteType
        const noteId = parsed.data.noteId
        const note =
          noteType === 'credit'
            ? await prisma.creditNote.findFirst({
                where: {
                  id: noteId,
                  businessProfileId: auth.profileId,
                  ...WHERE_NOT_DELETED,
                },
                include: {
                  lines: { orderBy: { sortOrder: 'asc' } },
                  createdByStaff: { select: { name: true } },
                },
              })
            : await prisma.debitNote.findFirst({
                where: {
                  id: noteId,
                  businessProfileId: auth.profileId,
                  ...WHERE_NOT_DELETED,
                },
                include: {
                  lines: { orderBy: { sortOrder: 'asc' } },
                  createdByStaff: { select: { name: true } },
                },
              })
        if (!note) {
          return jsonError(404, 'NOT_FOUND', 'Note not found')
        }
        {
          const windowErr = cashierWindowForbiddenResponse(
            sessionNeedsCashierDocumentWindow(auth.session),
            note.noteDate,
          )
          if (windowErr) return windowErr
        }
        if (!note.qrCode?.trim()) {
          return jsonError(
            409,
            'QR_REQUIRED',
            'Wait for ZATCA reporting before printing',
          )
        }
        receipt = buildReceiptPayloadFromNote({
          note,
          documentNature: noteType,
          locale,
          logoPngBase64,
        })
      }
    } catch (e) {
      const code =
        e && typeof e === 'object' && 'code' in e ? String(e.code) : ''
      if (code === 'QR_REQUIRED') {
        return jsonError(409, 'QR_REQUIRED', 'Phase-2 QR required')
      }
      throw e
    }

    /** @type {{ kind: string, rawBase64: string, bytes: number }[]} */
    const copies = []
    for (const kind of RECEIPT_COPY_KINDS) {
      const buffer = await buildEscposBuffer({
        ...receipt,
        copyLabel: receiptCopyLabel(kind, locale),
      })
      copies.push({
        kind,
        rawBase64: buffer.toString('base64'),
        bytes: buffer.length,
      })
    }

    return jsonOk({
      ready: true,
      copies,
    })
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/pos/print')
  }
}
