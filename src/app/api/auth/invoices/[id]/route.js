import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { mapInvoiceDetailToJson } from '@/lib/invoices/map-invoice-json'
import { restaurantLogoPreviewUrl } from '@/lib/print/load-receipt-logo'
import {
  cashierWindowForbiddenResponse,
  requireInvoiceRestaurant,
} from '@/lib/auth/require-invoice-restaurant'
import {
  canRepairFailedInvoice,
  canSoftDeleteInvoice,
} from '@/lib/notes/can-edit-or-cancel-invoice'
import {
  buildRepairedDocumentLines,
  CLEARED_ZATCA_ARTIFACTS,
} from '@/lib/notes/repair-failed-document'
import {
  cancelKitchenOrderForInvoice,
  refreshKitchenOrderAfterEdit,
} from '@/lib/orders/sync-kitchen-order'
import { primaryKitchenOrderInclude } from '@/lib/orders/primary-kitchen-order'
import { prisma } from '@/lib/prisma'

const repairLineSchema = z.object({
  menuItemId: z.string().trim().min(1).optional().nullable(),
  nameAr: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().max(200).optional().nullable(),
  quantity: z.number().int().min(0).max(999),
  unitPrice: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,4})?$/),
  vatPreset: z.enum(['standard', 'zero', 'exempt']),
  lineNote: z.string().trim().max(300).optional().nullable(),
  modifiersSnapshot: z.unknown().optional().nullable(),
})

const repairBodySchema = z.object({
  lines: z.array(repairLineSchema).min(1).max(100),
})

export async function GET(_request, context) {
  try {
    const auth = await requireInvoiceRestaurant()
    if (auth.error) return auth.error

    const { id } = await context.params
    const invoice = await prisma.invoice.findFirst({
      where: { id, businessProfileId: auth.profileId, ...WHERE_NOT_DELETED },
      include: {
        lines: { orderBy: { sortOrder: 'asc' } },
        createdByStaff: { select: { id: true, name: true } },
        kitchenOrders: primaryKitchenOrderInclude(),
      },
    })
    if (!invoice) return jsonError(404, 'NOT_FOUND', 'Invoice not found')
    const windowErr = cashierWindowForbiddenResponse(
      auth.isCashier,
      invoice.invoiceDate,
    )
    if (windowErr) return windowErr

    const profile = await prisma.businessProfile.findUnique({
      where: { id: auth.profileId },
      select: { logoStoragePath: true, updatedAt: true, id: true },
    })
    return jsonOk({
      invoice: mapInvoiceDetailToJson(invoice),
      logoUrl: restaurantLogoPreviewUrl(profile),
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/invoices/[id]')
  }
}

/**
 * Soft-delete a failed invoice (hidden from lists; number stays reserved).
 */
export async function DELETE(_request, context) {
  try {
    const auth = await requireInvoiceRestaurant()
    if (auth.error) return auth.error

    const { id } = await context.params
    if (!id || typeof id !== 'string') {
      return jsonError(400, 'VALIDATION_ERROR', 'Invoice id required')
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id, businessProfileId: auth.profileId, ...WHERE_NOT_DELETED },
    })
    if (!invoice) {
      return jsonError(404, 'NOT_FOUND', 'Invoice not found')
    }
    const windowErr = cashierWindowForbiddenResponse(
      auth.isCashier,
      invoice.invoiceDate,
    )
    if (windowErr) return windowErr

    if (!canSoftDeleteInvoice(invoice)) {
      return jsonError(
        409,
        'NOT_DELETABLE',
        'Only pending or failed invoices can be deleted',
      )
    }

    await prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id },
        data: { deletedAt: new Date() },
      })
      await cancelKitchenOrderForInvoice(tx, id)
    })
    return jsonOk({ deleted: true })
  } catch (err) {
    return handleRouteError(err, 'DELETE /api/auth/invoices/[id]')
  }
}

/**
 * Repair a failed invoice in-place (mutate lines, clear ZATCA artifacts → pending).
 */
export async function PATCH(request, context) {
  try {
    const auth = await requireInvoiceRestaurant()
    if (auth.error) return auth.error

    const { id } = await context.params
    if (!id || typeof id !== 'string') {
      return jsonError(400, 'VALIDATION_ERROR', 'Invoice id required')
    }

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = repairBodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id, businessProfileId: auth.profileId, ...WHERE_NOT_DELETED },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    })
    if (!invoice) {
      return jsonError(404, 'NOT_FOUND', 'Invoice not found')
    }
    const windowErr = cashierWindowForbiddenResponse(
      auth.isCashier,
      invoice.invoiceDate,
    )
    if (windowErr) return windowErr

    if (!canRepairFailedInvoice(invoice)) {
      return jsonError(
        409,
        'NOT_EDITABLE',
        'Only pending or failed invoices can be edited this way',
      )
    }

    let built
    try {
      built = buildRepairedDocumentLines(parsed.data.lines, { kind: 'invoice' })
    } catch (e) {
      const code =
        e && typeof e === 'object' && 'code' in e ? String(e.code) : 'VALIDATION_ERROR'
      return jsonError(
        400,
        code,
        e instanceof Error ? e.message : 'Invalid lines',
      )
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.invoiceLine.deleteMany({ where: { invoiceId: id } })
      const row = await tx.invoice.update({
        where: { id },
        data: {
          ...built.totals,
          ...CLEARED_ZATCA_ARTIFACTS,
          lines: { create: built.lineCreates },
        },
        include: {
          lines: { orderBy: { sortOrder: 'asc' } },
          createdByStaff: { select: { id: true, name: true } },
          kitchenOrders: primaryKitchenOrderInclude(),
        },
      })
      await refreshKitchenOrderAfterEdit(tx, id, row.lines)
      return row
    }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)

    return jsonOk({ invoice: mapInvoiceDetailToJson(updated) })
  } catch (err) {
    return handleRouteError(err, 'PATCH /api/auth/invoices/[id]')
  }
}
