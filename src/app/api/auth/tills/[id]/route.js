import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { prisma } from '@/lib/prisma'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { mapTillToJson } from '@/lib/tills/map-till-json'
import { tillPatchSchema } from '@/lib/tills/till-body-schema'

export async function GET(request, context) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error

    const { id } = await context.params
    const row = await prisma.posTill.findFirst({
      where: { id, businessProfileId: auth.profile.id },
    })
    if (!row) return jsonError(404, 'NOT_FOUND', 'Till not found')
    return jsonOk({ till: mapTillToJson(row) })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/tills/:id')
  }
}

export async function PATCH(request, context) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error

    const { id } = await context.params
    const existing = await prisma.posTill.findFirst({
      where: { id, businessProfileId: auth.profile.id },
      select: { id: true },
    })
    if (!existing) return jsonError(404, 'NOT_FOUND', 'Till not found')

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = tillPatchSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const d = parsed.data
    /** @type {Record<string, unknown>} */
    const data = {}
    if (d.name !== undefined) data.name = d.name
    if (d.displayEnabled !== undefined) data.displayEnabled = d.displayEnabled
    if (d.displayPort !== undefined) {
      data.displayPort = d.displayPort?.trim() || null
    }
    if (d.displayBaud !== undefined) data.displayBaud = d.displayBaud
    if (d.displayProtocol !== undefined) data.displayProtocol = d.displayProtocol
    if (d.drawerEnabled !== undefined) data.drawerEnabled = d.drawerEnabled
    if (d.drawerPort !== undefined) data.drawerPort = d.drawerPort?.trim() || null
    if (d.drawerProtocol !== undefined) data.drawerProtocol = d.drawerProtocol
    if (d.printVia !== undefined) data.printVia = d.printVia
    if (d.lanPrinters !== undefined) data.lanPrinters = d.lanPrinters
    if (d.usbPrinters !== undefined) data.usbPrinters = d.usbPrinters

    const row = await prisma.posTill.update({
      where: { id },
      data,
    })
    return jsonOk({ till: mapTillToJson(row) })
  } catch (err) {
    return handleRouteError(err, 'PATCH /api/auth/tills/:id')
  }
}

export async function DELETE(request, context) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error

    const { id } = await context.params
    const existing = await prisma.posTill.findFirst({
      where: { id, businessProfileId: auth.profile.id },
      select: { id: true },
    })
    if (!existing) return jsonError(404, 'NOT_FOUND', 'Till not found')

    await prisma.posTill.delete({ where: { id } })
    return jsonOk({ deleted: true })
  } catch (err) {
    return handleRouteError(err, 'DELETE /api/auth/tills/:id')
  }
}
