import { z } from 'zod'
import { jsonError, jsonOk } from '@/lib/api/json-response'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { runPosNotificationReminders } from '@/lib/notifications/run-pos-notification-reminders'
import { prisma } from '@/lib/prisma'

/** @param {import('@/generated/prisma').Notification} n */
function mapNotificationToJson(n) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    link: n.link,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  }
}

/**
 * @param {string} userId
 * @param {string} businessProfileId
 */
function scopedWhere(userId, businessProfileId) {
  return { userId, businessProfileId }
}

/** @param {import('next/server').NextRequest} request */
export async function GET(request) {
  const auth = await authorizeBusinessRequest(request, { skipPermissionCheck: true })
  if (auth.error) return auth.error
  const { session, profile } = auth

  // Opportunistic reminders while the bell polls (throttled per restaurant).
  void runPosNotificationReminders(profile.id).catch((err) => {
    console.error('[hisabi-pos:notifications] reminders failed', err)
  })

  const where = scopedWhere(session.id, profile.id)

  const notifications = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 30,
  })

  const unreadCount = await prisma.notification.count({
    where: { ...where, readAt: null },
  })

  return jsonOk({
    notifications: notifications.map(mapNotificationToJson),
    unreadCount,
  })
}

const patchBodySchema = z.union([
  z.object({ id: z.string().trim().min(1) }),
  z.object({ all: z.literal(true) }),
])

/** @param {import('next/server').NextRequest} request */
export async function PATCH(request) {
  const auth = await authorizeBusinessRequest(request, { skipPermissionCheck: true })
  if (auth.error) return auth.error
  const { session, profile } = auth

  let body
  try {
    body = await request.json()
  } catch {
    return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
  }

  const parsed = patchBodySchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, 'VALIDATION_ERROR', 'Invalid input')
  }

  const now = new Date()
  const where = scopedWhere(session.id, profile.id)

  if ('all' in parsed.data && parsed.data.all) {
    await prisma.notification.updateMany({
      where: { ...where, readAt: null },
      data: { readAt: now },
    })
    return jsonOk({ ok: true })
  }

  if ('id' in parsed.data) {
    const updated = await prisma.notification.updateMany({
      where: { ...where, id: parsed.data.id },
      data: { readAt: now },
    })
    if (updated.count === 0) {
      return jsonError(404, 'NOT_FOUND', 'Notification not found')
    }
    return jsonOk({ ok: true })
  }

  return jsonError(400, 'VALIDATION_ERROR', 'Invalid input')
}
