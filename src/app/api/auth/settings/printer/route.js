import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import {
  MAX_RECEIPT_PRINTERS,
  loadReceiptPrinterRows,
  printersForSettingsPayload,
  replaceReceiptPrinters,
} from '@/lib/print/receipt-printers'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const printerEntrySchema = z.object({
  ip: z
    .string()
    .trim()
    .max(100)
    .regex(/^[0-9a-fA-F.:]+$|^$/),
  port: z.number().int().min(1).max(65535),
})

const patchSchema = z
  .object({
    printerIp: z
      .string()
      .trim()
      .max(100)
      .regex(/^[0-9a-fA-F.:]+$|^$/)
      .nullable()
      .optional(),
    printerPort: z.number().int().min(1).max(65535).optional(),
    printers: z.array(printerEntrySchema).max(MAX_RECEIPT_PRINTERS).optional(),
  })
  .refine(
    (b) =>
      b.printers !== undefined ||
      b.printerIp !== undefined ||
      b.printerPort !== undefined,
    { message: 'Provide printers or printerIp/printerPort' },
  )

/** @param {import('next/server').NextRequest} request */
export async function GET(request) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error

    const profile = await prisma.businessProfile.findUnique({
      where: { id: auth.profile.id },
      select: { printerIp: true, printerPort: true },
    })
    if (!profile) {
      return jsonError(404, 'NOT_FOUND', 'Restaurant profile not found')
    }
    const rows = await loadReceiptPrinterRows(prisma, auth.profile.id)
    return jsonOk({
      printer: printersForSettingsPayload(rows, profile),
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/settings/printer')
  }
}

/** @param {import('next/server').NextRequest} request */
export async function PATCH(request) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (parsed.data.printers !== undefined) {
        await replaceReceiptPrinters(tx, auth.profile.id, parsed.data.printers)
      } else {
        const current = await tx.businessProfile.findUnique({
          where: { id: auth.profile.id },
          select: { printerIp: true, printerPort: true },
        })
        const ip =
          parsed.data.printerIp !== undefined
            ? parsed.data.printerIp?.trim() || ''
            : current?.printerIp ?? ''
        const port =
          parsed.data.printerPort !== undefined
            ? parsed.data.printerPort
            : current?.printerPort ?? 9100
        await replaceReceiptPrinters(tx, auth.profile.id, [{ ip, port }])
      }

      const profile = await tx.businessProfile.findUnique({
        where: { id: auth.profile.id },
        select: { printerIp: true, printerPort: true },
      })
      const rows = await loadReceiptPrinterRows(tx, auth.profile.id)
      return printersForSettingsPayload(rows, profile)
    })

    return jsonOk({ printer: updated })
  } catch (err) {
    return handleRouteError(err, 'PATCH /api/auth/settings/printer')
  }
}
