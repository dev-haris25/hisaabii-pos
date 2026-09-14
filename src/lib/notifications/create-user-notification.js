import { prisma } from '@/lib/prisma'
import { buildNotificationCopy } from '@/lib/notifications/notification-copy'

/**
 * Maps a notification kind to the User preference column that gates it.
 * @type {Record<string, string>}
 */
export const NOTIFICATION_KIND_TO_TOGGLE = {
  zatca: 'notifyZatca',
  hr: 'notifyHr',
  salesOps: 'notifySalesOps',
  team: 'notifyTeam',
}

const TOGGLE_SELECT = Object.fromEntries(
  Object.values(NOTIFICATION_KIND_TO_TOGGLE).map((col) => [col, true]),
)

/**
 * @param {string} userId
 * @param {string} kind
 */
export async function shouldNotifyUserKind(userId, kind) {
  const toggle = NOTIFICATION_KIND_TO_TOGGLE[kind]
  if (!toggle) return true
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: TOGGLE_SELECT,
  })
  if (!user) return false
  return user[toggle] !== false
}

/**
 * Create an in-app notification for one user (respects category toggle + dedupe).
 *
 * @param {{
 *   businessProfileId: string
 *   userId: string
 *   type: string
 *   title?: string
 *   message?: string
 *   vars?: Record<string, string>
 *   link?: string | null
 *   kind?: string
 *   dedupeKey?: string | null
 * }} p
 */
export async function createUserNotificationIfEnabled(p) {
  const kind = p.kind ?? 'salesOps'
  const allowed = await shouldNotifyUserKind(p.userId, kind)
  if (!allowed) return

  const user = await prisma.user.findUnique({
    where: { id: p.userId },
    select: { preferredLocale: true },
  })
  const locale = user?.preferredLocale === 'ar' ? 'ar' : 'en'

  const fromCopy =
    p.vars != null || p.title == null || p.message == null
      ? buildNotificationCopy(p.type, locale, p.vars ?? {}, {
          title: p.title,
          message: p.message,
        })
      : null

  const title = fromCopy?.title ?? p.title ?? p.type
  const message = fromCopy?.message ?? p.message ?? ''

  try {
    await prisma.notification.create({
      data: {
        businessProfileId: p.businessProfileId,
        userId: p.userId,
        type: p.type,
        title,
        message,
        link: p.link ?? null,
        dedupeKey: p.dedupeKey ?? null,
      },
    })
  } catch (err) {
    if (/** @type {{ code?: string }} */ (err)?.code === 'P2002') return
    throw err
  }
}
