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

export async function GET(request) {
  const auth = await authorizeBusinessRequest(request)
  if (auth.error) return auth.error
  const { session, profile } = auth

  const rows = await prisma.idType.findMany({
    where: { businessProfileId: profile.id, ...WHERE_NOT_DELETED },
    orderBy: [{ name: 'asc' }],
    select: idTypeSelect,
  })

  return jsonOk({ items: rows.map(mapIdTypeToJson) })
}

export async function POST(request) {
  const auth = await authorizeBusinessRequest(request)
  if (auth.error) return auth.error
  const { session, profile } = auth

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

  const existingInsensitive = await prisma.idType.findFirst({
    where: {
      businessProfileId: profile.id,
      ...WHERE_NOT_DELETED,
      name: { equals: name, mode: 'insensitive' },
    },
    select: { id: true },
  })
  if (existingInsensitive) {
    return jsonError(
      409,
      'DUPLICATE_ID_TYPE',
      'An ID type with this name already exists',
    )
  }

  try {
    const created = await prisma.idType.create({
      data: {
        businessProfileId: profile.id,
        name,
      },
      select: idTypeSelect,
    })
    const item = mapIdTypeToJson(created)
    return jsonOk({ item, idType: item })
  } catch (err) {
    console.error('[hisabi:hr-id-types] POST failed', err)
    return jsonError(500, 'SERVER_ERROR', 'Something went wrong')
  }
}
