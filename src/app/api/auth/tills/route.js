import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { prisma } from '@/lib/prisma'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { mapTillToJson } from '@/lib/tills/map-till-json'
import { tillCreateSchema } from '@/lib/tills/till-body-schema'

export async function GET(request) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error

    const rows = await prisma.posTill.findMany({
      where: { businessProfileId: auth.profile.id },
      orderBy: [{ createdAt: 'asc' }],
    })
    return jsonOk({ tills: rows.map(mapTillToJson) })
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
    const row = await prisma.posTill.create({
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
    return jsonOk({ till: mapTillToJson(row) })
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/tills')
  }
}
