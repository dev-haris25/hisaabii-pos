import { jsonError, jsonOk } from '@/lib/api/json-response'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { idTypeUpsertBodySchema } from '@/lib/hr/id-types/id-type-body-schema'
import { prisma } from '@/lib/prisma'

/** @param {{ id: string, name: string }} row */
function mapIdTypeToJson(row) {
  return {
    id: row.id,
    name: row.name,
  }
}

const idTypeSelect = { id: true, name: true }

/** @param {import('next/server').NextRequest} request @param {{ params: Promise<{ id: string }> }} ctx */
export async function PATCH(request, ctx) {
  const auth = await authorizeBusinessRequest(request)
  if (auth.error) return auth.error
  const { session, profile } = auth

  const { id } = await ctx.params
  if (!id) {
    return jsonError(400, 'VALIDATION_ERROR', 'Missing id')
  }

  const existing = await prisma.idType.findFirst({
    where: { id, businessProfileId: profile.id, ...WHERE_NOT_DELETED },
  })
  if (!existing) {
    return jsonError(404, 'NOT_FOUND', 'ID type not found')
  }

  let body
  try {
    body = await request.json()
  } catch {
    return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
  }

  const parsed = idTypeUpsertBodySchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, 'VALIDATION_ERROR', 'Invalid input')
  }

  const { name } = parsed.data

  const duplicate = await prisma.idType.findFirst({
    where: {
      businessProfileId: profile.id,
      ...WHERE_NOT_DELETED,
      id: { not: id },
      name: { equals: name, mode: 'insensitive' },
    },
    select: { id: true },
  })
  if (duplicate) {
    return jsonError(
      409,
      'DUPLICATE_ID_TYPE',
      'An ID type with this name already exists',
    )
  }

  try {
    const updated = await prisma.idType.update({
      where: { id },
      data: { name },
      select: idTypeSelect,
    })
    return jsonOk({ item: mapIdTypeToJson(updated) })
  } catch (err) {
    console.error('[hisabi:hr-id-types] PATCH failed', err)
    return jsonError(500, 'SERVER_ERROR', 'Something went wrong')
  }
}

/** @param {import('next/server').NextRequest} _request @param {{ params: Promise<{ id: string }> }} ctx */
export async function DELETE(request, ctx) {
  const auth = await authorizeBusinessRequest(request)
  if (auth.error) return auth.error
  const { session, profile } = auth

  const { id } = await ctx.params
  if (!id) {
    return jsonError(400, 'VALIDATION_ERROR', 'Missing id')
  }

  const existing = await prisma.idType.findFirst({
    where: { id, businessProfileId: profile.id, ...WHERE_NOT_DELETED },
  })
  if (!existing) {
    return jsonError(404, 'NOT_FOUND', 'ID type not found')
  }

  await prisma.idType.update({
    where: { id },
    data: { deletedAt: new Date() },
  })

  return jsonOk({ deleted: true })
}
