import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { prisma } from '@/lib/prisma'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { mapTillToJson } from '@/lib/tills/map-till-json'
import { ensurePrimaryPosTillId } from '@/lib/tills/primary-pos-till'
import { tillCreateSchema } from '@/lib/tills/till-body-schema'

export async function GET(request) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error

    const primaryPosTillId = await ensurePrimaryPosTillId(auth.profile.id)
    const rows = await prisma.posTill.findMany({
      where: { businessProfileId: auth.profile.id },
      orderBy: [{ createdAt: 'asc' }],
    })
    return jsonOk({
      primaryPosTillId,
      tills: rows.map((row) => mapTillToJson(row, primaryPosTillId)),
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/tills')
  }
}

export async function POST(request) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = tillCreateSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const d = parsed.data
    const result = await prisma.$transaction(async (tx) => {
      const existingCount = await tx.posTill.count({
        where: { businessProfileId: auth.profile.id },
      })
      const row = await tx.posTill.create({
        data: {
          businessProfileId: auth.profile.id,
          name: d.name,
          displayEnabled: d.displayEnabled ?? true,
          displayPort: d.displayPort?.trim() || null,
          displayBaud: d.displayBaud ?? 9600,
          displayProtocol: d.displayProtocol ?? 'vfd_ascii',
          drawerEnabled: d.drawerEnabled ?? true,
          drawerPort: d.drawerPort?.trim() || null,
          drawerProtocol: d.drawerProtocol ?? 'escpos_pulse',
          printVia: d.printVia ?? 'lan',
          lanPrinters: d.lanPrinters ?? [],
          usbPrinters: d.usbPrinters ?? [],
        },
      })

      let primaryPosTillId = null
      if (existingCount === 0) {
        await tx.businessProfile.update({
          where: { id: auth.profile.id },
          data: { primaryPosTillId: row.id },
        })
        primaryPosTillId = row.id
      } else {
        primaryPosTillId = await ensurePrimaryPosTillId(auth.profile.id, tx)
      }

      return { row, primaryPosTillId }
    })

    return jsonOk({
      primaryPosTillId: result.primaryPosTillId,
      till: mapTillToJson(result.row, result.primaryPosTillId),
    })
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/tills')
  }
}
