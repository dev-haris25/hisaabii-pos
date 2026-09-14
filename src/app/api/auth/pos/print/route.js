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
import { listConfiguredReceiptPrinters } from '@/lib/print/receipt-printers'
import {
  RECEIPT_COPY_KINDS,
  receiptCopyLabel,
} from '@/lib/print/receipt-copy-labels'
import { sendReceiptToPrintBridge } from '@/lib/print/send-receipt-to-print-bridge'
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
    const printers = await listConfiguredReceiptPrinters(
      prisma,
      auth.profileId,
    )

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
            kitchenOrder: { select: { orderNumber: true } },
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

    if (printers.length === 0) {
      return jsonError(400, 'PRINTER_NOT_CONFIGURED', 'Set the printer IP in Settings first')
    }

    const results = await Promise.all(
      printers.map(async (printer) => {
        /** @type {string | null} */
        let firstDryRunPath = null
        /** @type {number | null} */
        let lastBytes = null
        let allDryRun = true
        /** @type {string | null} */
        let failCode = null

        for (const kind of RECEIPT_COPY_KINDS) {
          try {
            const result = await sendReceiptToPrintBridge({
              receipt: {
                ...receipt,
                copyLabel: receiptCopyLabel(kind, locale),
              },
              printer,
            })
            allDryRun = allDryRun && Boolean(result.dryRun)
            if (!firstDryRunPath && typeof result.dryRunPath === 'string') {
              firstDryRunPath = result.dryRunPath
            }
            if (typeof result.bytes === 'number') lastBytes = result.bytes
          } catch (e) {
            failCode =
              e && typeof e === 'object' && 'code' in e
                ? String(e.code)
                : 'PRINT_FAILED'
          }
        }

        if (failCode) {
          return {
            ip: printer.ip,
            ok: false,
            code: failCode,
            dryRun: false,
            dryRunPath: null,
            bytes: null,
          }
        }

        return {
          ip: printer.ip,
          ok: true,
          code: null,
          dryRun: allDryRun,
          dryRunPath: firstDryRunPath,
          bytes: lastBytes,
        }
      }),
    )

    const successes = results.filter((r) => r.ok)
    const failures = results.filter((r) => !r.ok)

    if (successes.length === 0) {
      const allUnreachable = failures.every(
        (r) => r.code === 'PRINT_BRIDGE_UNREACHABLE',
      )
      if (allUnreachable) {
        return jsonError(
          503,
          'PRINT_BRIDGE_UNREACHABLE',
          'Print bridge is not running. Start it with: bun run print-bridge',
        )
      }
      const allUnconfigured = failures.every(
        (r) => r.code === 'PRINTER_NOT_CONFIGURED',
      )
      if (allUnconfigured) {
        return jsonError(400, 'PRINTER_NOT_CONFIGURED', 'Set the printer IP in Settings first')
      }
      if (failures.some((r) => r.code === 'QR_REQUIRED')) {
        return jsonError(409, 'QR_REQUIRED', 'Phase-2 QR required')
      }
      return jsonError(502, 'PRINT_FAILED', 'Could not print the receipt')
    }

    const firstOk = successes[0]
    return jsonOk({
      printed: true,
      printedCount: successes.length,
      failedCount: failures.length,
      printers: results,
      dryRun: successes.every((r) => r.dryRun),
      dryRunPath: firstOk.dryRunPath,
      bytes: firstOk.bytes,
    })
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/pos/print')
  }
}
