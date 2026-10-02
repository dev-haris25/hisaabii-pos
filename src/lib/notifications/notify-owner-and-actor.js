import { createUserNotificationIfEnabled } from '@/lib/notifications/create-user-notification'
import { resolveNotificationRecipients } from '@/lib/notifications/resolve-notification-recipients'

/**
 * Fan out an in-app notification to role-appropriate recipients (+ extras).
 * Errors are swallowed so notification failures never break the main mutation.
 *
 * @param {{
 *   businessProfileId: string
 *   audience: 'zatca' | 'hr' | 'salesOps' | 'eWaiterFloor' | 'team' | 'ownerAdmin'
 *   type: string
 *   kind?: string
 *   title?: string
 *   message?: string
 *   vars?: Record<string, string>
 *   link?: string | null
 *   dedupeKey?: string | null
 *   extraUserIds?: string[]
 *   actorUserId?: string | null
 * }} p
 */
export async function notifyPosAudience(p) {
  try {
    const extras = [...(p.extraUserIds ?? [])]
    if (p.actorUserId) extras.push(p.actorUserId)

    const recipients = await resolveNotificationRecipients(
      p.businessProfileId,
      p.audience,
      extras,
    )
    if (recipients.length === 0) return

    const kind = p.kind ?? p.audience
    for (const userId of recipients) {
      await createUserNotificationIfEnabled({
        businessProfileId: p.businessProfileId,
        userId,
        type: p.type,
        title: p.title,
        message: p.message,
        vars: p.vars,
        link: p.link ?? null,
        kind,
        dedupeKey: p.dedupeKey ?? null,
      })
    }
  } catch (err) {
    console.error('[hisabi-pos:notifications] notifyPosAudience failed', err)
  }
}

/**
 * Backward-compatible name used by older stubs — maps to owner + actor + salesOps roles.
 *
 * @param {{
 *   businessProfileId: string
 *   actorUserId?: string | null
 *   type: string
 *   title?: string
 *   message?: string
 *   vars?: Record<string, string>
 *   link?: string | null
 *   kind?: string
 *   dedupeKey?: string | null
 * }} p
 */
export async function notifyOwnerAndActor(p) {
  const audience =
    p.kind === 'hr'
      ? 'hr'
      : p.kind === 'zatca'
        ? 'zatca'
        : p.kind === 'team'
          ? 'team'
          : 'salesOps'

  await notifyPosAudience({
    businessProfileId: p.businessProfileId,
    audience,
    type: p.type,
    kind: p.kind ?? audience,
    title: p.title,
    message: p.message,
    vars: p.vars,
    link: p.link,
    dedupeKey: p.dedupeKey,
    actorUserId: p.actorUserId,
  })
}
