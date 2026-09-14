import {
  AUTH_USER_SELECT,
  buildAuthUserFromRowAsync,
} from '@/lib/auth/auth-user-json'
import { z } from 'zod'
import { jsonError, jsonOk } from '@/lib/api/json-response'
import { getSessionUser } from '@/lib/auth/get-session-user'
import { prisma } from '@/lib/prisma'

function mapProfile(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    preferredLocale: user.preferredLocale === 'ar' ? 'ar' : 'en',
    notifyZatca: user.notifyZatca !== false,
    notifyHr: user.notifyHr !== false,
    notifySalesOps: user.notifySalesOps !== false,
    notifyTeam: user.notifyTeam !== false,
  }
}

const profileSelect = {
  id: true,
  name: true,
  email: true,
  preferredLocale: true,
  notifyZatca: true,
  notifyHr: true,
  notifySalesOps: true,
  notifyTeam: true,
}

/** @param {import('next/server').NextRequest} _request */
export async function GET(_request) {
  const session = await getSessionUser()
  if (!session) return jsonError(401, 'UNAUTHORIZED', 'Not signed in')

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: profileSelect,
  })
  if (!user) return jsonError(404, 'NOT_FOUND', 'User not found')
  return jsonOk({ profile: mapProfile(user) })
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  preferredLocale: z.enum(['en', 'ar']).optional(),
  notifyZatca: z.boolean().optional(),
  notifyHr: z.boolean().optional(),
  notifySalesOps: z.boolean().optional(),
  notifyTeam: z.boolean().optional(),
})

/** @param {import('next/server').NextRequest} request */
export async function PATCH(request) {
  const session = await getSessionUser()
  if (!session) return jsonError(401, 'UNAUTHORIZED', 'Not signed in')

  let body
  try {
    body = await request.json()
  } catch {
    return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, 'VALIDATION_ERROR', 'Invalid input')
  }

  /** @type {Record<string, unknown>} */
  const data = {}
  if (parsed.data.name !== undefined) data.name = parsed.data.name
  if (parsed.data.preferredLocale !== undefined) {
    data.preferredLocale = parsed.data.preferredLocale
  }
  if (parsed.data.notifyZatca !== undefined) data.notifyZatca = parsed.data.notifyZatca
  if (parsed.data.notifyHr !== undefined) data.notifyHr = parsed.data.notifyHr
  if (parsed.data.notifySalesOps !== undefined) {
    data.notifySalesOps = parsed.data.notifySalesOps
  }
  if (parsed.data.notifyTeam !== undefined) data.notifyTeam = parsed.data.notifyTeam

  const user = await prisma.user.update({
    where: { id: session.id },
    data,
    select: profileSelect,
  })

  const userRow = await prisma.user.findUnique({
    where: { id: session.id },
    select: AUTH_USER_SELECT,
  })
  const authUser = userRow ? await buildAuthUserFromRowAsync(userRow) : null

  return jsonOk({
    profile: mapProfile(user),
    ...(authUser ? { user: authUser } : {}),
  })
}
