import { z } from 'zod'

import { defaultVatPercentFromPreset } from '@/lib/auth/vat-preset'
import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import {
  MAX_RECEIPT_PRINTERS,
  loadReceiptPrinterRows,
  printersForSettingsPayload,
  replaceReceiptPrinters,
} from '@/lib/print/receipt-printers'
import {
  customerQueueAbsoluteUrl,
  customerQueueOriginFromRequest,
  normalizeCustomerQueueLocale,
} from '@/lib/orders/customer-queue-url'
import { getOrCreateBusinessSettings } from '@/lib/settings/get-or-create-business-settings'
import { hasFullAccess } from '@/lib/rbac/ability-utils'
import { prisma } from '@/lib/prisma'

const prefixSchema = z.string().trim().min(1).max(20)
const optionalEmail = z
  .union([z.string().email(), z.literal(''), z.null()])
  .optional()

const settingsPatchBodySchema = z
  .object({
    invoicePrefix: prefixSchema.optional(),
    creditNotePrefix: prefixSchema.optional(),
    debitNotePrefix: prefixSchema.optional(),
    salarySlipPrefix: prefixSchema.optional(),
    numberPadding: z.number().int().min(1).max(10).optional(),
    dateFormat: z.enum(['dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd']).optional(),
    numberFormat: z.enum(['1,234.56', '1234.56']).optional(),
    defaultVatPreset: z.enum(['standard', 'zero']).optional(),
    email: optionalEmail,
    phone: z.string().trim().max(40).nullable().optional(),
    printerIp: z
      .string()
      .trim()
      .max(100)
      .regex(/^[0-9a-fA-F.:]+$|^$/)
      .nullable()
      .optional(),
    printerPort: z.number().int().min(1).max(65535).optional(),
    printers: z
      .array(
        z.object({
          ip: z
            .string()
            .trim()
            .max(100)
            .regex(/^[0-9a-fA-F.:]+$|^$/),
          port: z.number().int().min(1).max(65535),
        }),
      )
      .max(MAX_RECEIPT_PRINTERS)
      .optional(),
    customerQueueLocale: z.enum(['ar', 'en']).optional(),
    discountCap: z
      .union([
        z.literal(''),
        z.null(),
        z
          .string()
          .trim()
          .regex(/^\d+(\.\d{1,4})?$/)
          .refine((v) => {
            const n = Number.parseFloat(v)
            return Number.isFinite(n) && n >= 0 && n <= 100
          }, 'Discount cap must be 0–100'),
      ])
      .optional(),
    posOnScreenKeypad: z.boolean().optional(),
    allowNegativeStock: z.boolean().optional(),
    allowMainStockIfNoKitchenStock: z.boolean().optional(),
    lowStockAlertsEnabled: z.boolean().optional(),
    emailHighWasteReports: z.boolean().optional(),
  })
  .strict()

/**
 * @param {import('@/generated/prisma').BusinessSettings} settings
 * @param {import('@/generated/prisma').BusinessProfile} profile
 * @param {{ ip: string, port: number }[]} printerRows
 * @param {string} [origin]
 * @param {boolean} [emailHighWasteReports]
 */
function mapSettingsPayload(
  settings,
  profile,
  printerRows,
  origin = '',
  emailHighWasteReports = false,
) {
  const defaultVatPreset =
    profile.defaultVatPercent === '0' ? 'zero' : 'standard'
  const printers = printersForSettingsPayload(printerRows, profile)
  const customerQueueLocale = normalizeCustomerQueueLocale(
    profile.customerQueueLocale,
  )
  return {
    invoicePrefix: settings.invoicePrefix,
    creditNotePrefix: settings.creditNotePrefix,
    debitNotePrefix: settings.debitNotePrefix,
    salarySlipPrefix: settings.salarySlipPrefix,
    numberPadding: settings.numberPadding,
    dateFormat: settings.dateFormat,
    numberFormat: settings.numberFormat,
    currencyCode: 'SAR',
    defaultVatPreset,
    email: profile.email,
    phone: profile.phone,
    discountCap: settings.discountCap ?? null,
    posOnScreenKeypad: settings.posOnScreenKeypad === true,
    allowNegativeStock: settings.allowNegativeStock === true,
    allowMainStockIfNoKitchenStock:
      settings.allowMainStockIfNoKitchenStock === true,
    lowStockAlertsEnabled: settings.lowStockAlertsEnabled !== false,
    emailHighWasteReports: emailHighWasteReports === true,
    slug: profile.slug,
    customerQueueLocale,
    customerQueueOrigin: origin,
    customerQueueUrl: customerQueueAbsoluteUrl(
      origin,
      customerQueueLocale,
      profile.slug,
    ),
    ...printers,
  }
}

/** @param {import('next/server').NextRequest} request */
export async function GET(request) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const { profile } = auth

    const [settings, profileRow, printerRows, membership] = await Promise.all([
      getOrCreateBusinessSettings(profile.id),
      prisma.businessProfile.findUnique({ where: { id: profile.id } }),
      loadReceiptPrinterRows(prisma, profile.id),
      prisma.businessMembership.findUnique({
        where: {
          userId_businessProfileId: {
            userId: auth.session.id,
            businessProfileId: profile.id,
          },
        },
        select: { emailHighWasteReports: true },
      }),
    ])
    if (!profileRow) {
      return jsonError(404, 'NOT_FOUND', 'Restaurant not found')
    }

    return jsonOk({
      settings: mapSettingsPayload(
        settings,
        profileRow,
        printerRows,
        customerQueueOriginFromRequest(request),
        membership?.emailHighWasteReports === true,
      ),
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/settings')
  }
}

/** @param {import('next/server').NextRequest} request */
export async function PATCH(request) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const { profile } = auth

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = settingsPatchBodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const d = parsed.data
    const settingsData = {}
    if (d.invoicePrefix !== undefined) settingsData.invoicePrefix = d.invoicePrefix
    if (d.creditNotePrefix !== undefined) {
      settingsData.creditNotePrefix = d.creditNotePrefix
    }
    if (d.debitNotePrefix !== undefined) settingsData.debitNotePrefix = d.debitNotePrefix
    if (d.salarySlipPrefix !== undefined) {
      settingsData.salarySlipPrefix = d.salarySlipPrefix
    }
    if (d.numberPadding !== undefined) settingsData.numberPadding = d.numberPadding
    if (d.dateFormat !== undefined) settingsData.dateFormat = d.dateFormat
    if (d.numberFormat !== undefined) settingsData.numberFormat = d.numberFormat
    if (d.discountCap !== undefined) {
      const raw = d.discountCap == null ? '' : String(d.discountCap).trim()
      settingsData.discountCap = raw === '' ? null : raw
    }
    if (d.posOnScreenKeypad !== undefined) {
      settingsData.posOnScreenKeypad = d.posOnScreenKeypad
    }
    if (d.allowNegativeStock !== undefined) {
      settingsData.allowNegativeStock = d.allowNegativeStock
    }
    if (d.allowMainStockIfNoKitchenStock !== undefined) {
      settingsData.allowMainStockIfNoKitchenStock =
        d.allowMainStockIfNoKitchenStock
    }
    if (d.lowStockAlertsEnabled !== undefined) {
      settingsData.lowStockAlertsEnabled = d.lowStockAlertsEnabled
    }
    if (d.emailHighWasteReports !== undefined) {
      if (!hasFullAccess(auth.ability)) {
        return jsonError(
          403,
          'FORBIDDEN',
          'Only the owner or an admin can change this email alert',
        )
      }
    }

    /** @type {Record<string, unknown>} */
    const profileData = {}
    if (d.defaultVatPreset !== undefined) {
      profileData.defaultVatPercent = defaultVatPercentFromPreset(d.defaultVatPreset)
    }
    if (d.email !== undefined) {
      profileData.email = d.email === '' || d.email == null ? null : d.email
    }
    if (d.phone !== undefined) {
      profileData.phone = d.phone?.trim() || null
    }
    if (d.customerQueueLocale !== undefined) {
      profileData.customerQueueLocale = d.customerQueueLocale
    }
    if (d.printers === undefined) {
      if (d.printerIp !== undefined) {
        profileData.printerIp = d.printerIp?.trim() || null
      }
      if (d.printerPort !== undefined) profileData.printerPort = d.printerPort
    }

    const [settings, profileRow, printerRows, membership] = await prisma.$transaction(
      async (tx) => {
        if (Object.keys(profileData).length > 0) {
          await tx.businessProfile.update({
            where: { id: profile.id },
            data: profileData,
          })
        }

        if (d.printers !== undefined) {
          await replaceReceiptPrinters(tx, profile.id, d.printers)
        } else if (d.printerIp !== undefined || d.printerPort !== undefined) {
          const current = await tx.businessProfile.findUnique({
            where: { id: profile.id },
            select: { printerIp: true, printerPort: true },
          })
          await replaceReceiptPrinters(tx, profile.id, [
            {
              ip: current?.printerIp ?? '',
              port: current?.printerPort ?? 9100,
            },
          ])
        }

        const settings =
          Object.keys(settingsData).length > 0
            ? await tx.businessSettings.upsert({
                where: { businessProfileId: profile.id },
                create: { businessProfileId: profile.id, ...settingsData },
                update: settingsData,
              })
            : await getOrCreateBusinessSettings(profile.id, tx)

        if (d.emailHighWasteReports !== undefined) {
          await tx.businessMembership.upsert({
            where: {
              userId_businessProfileId: {
                userId: auth.session.id,
                businessProfileId: profile.id,
              },
            },
            create: {
              userId: auth.session.id,
              businessProfileId: profile.id,
              emailHighWasteReports: d.emailHighWasteReports === true,
            },
            update: { emailHighWasteReports: d.emailHighWasteReports === true },
          })
        }

        const [nextProfile, nextPrinters, membership] = await Promise.all([
          tx.businessProfile.findUnique({ where: { id: profile.id } }),
          loadReceiptPrinterRows(tx, profile.id),
          tx.businessMembership.findUnique({
            where: {
              userId_businessProfileId: {
                userId: auth.session.id,
                businessProfileId: profile.id,
              },
            },
            select: { emailHighWasteReports: true },
          }),
        ])
        return [settings, nextProfile, nextPrinters, membership]
      },
    )

    if (!profileRow) {
      return jsonError(404, 'NOT_FOUND', 'Restaurant not found')
    }

    return jsonOk({
      settings: mapSettingsPayload(
        settings,
        profileRow,
        printerRows,
        customerQueueOriginFromRequest(request),
        membership?.emailHighWasteReports === true,
      ),
    })
  } catch (err) {
    return handleRouteError(err, 'PATCH /api/auth/settings')
  }
}
