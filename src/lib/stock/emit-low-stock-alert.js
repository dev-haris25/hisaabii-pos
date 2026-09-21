import { sendLowStockAlertEmail } from '@/lib/email/send-low-stock-email'
import { notifyPosAudience } from '@/lib/notifications/notify-owner-and-actor'
import { resolveNotificationRecipients } from '@/lib/notifications/resolve-notification-recipients'
import { shouldNotifyUserKind } from '@/lib/notifications/create-user-notification'
import { getOrCreateBusinessSettings } from '@/lib/settings/get-or-create-business-settings'
import { isLowStock, stockUnitLabel } from '@/lib/stock/units'
import { prisma } from '@/lib/prisma'

/**
 * @param {string} businessProfileId
 * @param {string} stockItemId
 * @param {'ar' | 'en'} locale
 */
function buildStockItemUrl(businessProfileId, stockItemId, locale) {
  const base = (
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  ).replace(/\/$/, '')
  return `${base}/${locale}/stock/items/${stockItemId}`
}

/**
 * In-app low-stock alert is always on. Email is sent only when the restaurant
 * setting `lowStockAlertsEnabled` is true. Dedupes once per item per UTC day.
 *
 * @param {{
 *   businessProfileId: string
 *   stockItem: {
 *     id: string
 *     nameAr: string
 *     nameEn: string | null
 *     unit: import('@/lib/stock/units').StockUnit
 *     quantityOnHand: string
 *     lowStockThreshold: string | null
 *     active: boolean
 *   }
 *   actorUserId?: string | null
 * }} p
 */
export async function maybeEmitLowStockAlert(p) {
  const { businessProfileId, stockItem, actorUserId } = p
  if (!stockItem.active) return
  if (!isLowStock(stockItem.quantityOnHand, stockItem.lowStockThreshold)) return

  const dayKey = new Date().toISOString().slice(0, 10)
  const dedupeKey = `stock_low:${stockItem.id}:${dayKey}`
  const unitLabel = stockUnitLabel(stockItem.unit)
  const name = stockItem.nameEn || stockItem.nameAr
  const qty = `${stockItem.quantityOnHand} ${unitLabel}`
  const threshold = `${stockItem.lowStockThreshold} ${unitLabel}`
  const vars = { name, qty, threshold }
  const link = `/stock/items/${stockItem.id}`

  const alreadyNotified = await prisma.notification.findFirst({
    where: { businessProfileId, dedupeKey },
    select: { id: true },
  })

  await notifyPosAudience({
    businessProfileId,
    audience: 'salesOps',
    kind: 'salesOps',
    type: 'stock_low',
    vars,
    link,
    dedupeKey,
    actorUserId: actorUserId ?? null,
  })

  const settings = await getOrCreateBusinessSettings(businessProfileId)
  if (settings.lowStockAlertsEnabled !== true) return
  if (alreadyNotified) return

  try {
    await sendLowStockEmails({
      businessProfileId,
      stockItemId: stockItem.id,
      itemName: name,
      qty,
      threshold,
      actorUserId: actorUserId ?? null,
    })
  } catch (err) {
    console.error('[hisabi-pos:stock] low-stock email failed', err)
  }
}

/**
 * @param {{
 *   businessProfileId: string
 *   stockItemId: string
 *   itemName: string
 *   qty: string
 *   threshold: string
 *   actorUserId?: string | null
 * }} p
 */
async function sendLowStockEmails(p) {
  const extras = p.actorUserId ? [p.actorUserId] : []
  const recipientIds = await resolveNotificationRecipients(
    p.businessProfileId,
    'salesOps',
    extras,
  )
  if (recipientIds.length === 0) return

  const [profile, users] = await Promise.all([
    prisma.businessProfile.findUnique({
      where: { id: p.businessProfileId },
      select: { companyNameAr: true, companyNameEn: true },
    }),
    prisma.user.findMany({
      where: { id: { in: recipientIds }, active: true },
      select: {
        id: true,
        email: true,
        name: true,
        preferredLocale: true,
      },
    }),
  ])

  const restaurantNameEn =
    profile?.companyNameEn?.trim() || profile?.companyNameAr || 'Restaurant'
  const restaurantNameAr = profile?.companyNameAr || restaurantNameEn

  for (const user of users) {
    const allowed = await shouldNotifyUserKind(user.id, 'salesOps')
    if (!allowed) continue
    if (!user.email?.trim()) continue

    const locale = user.preferredLocale === 'ar' ? 'ar' : 'en'
    const restaurantName =
      locale === 'ar' ? restaurantNameAr : restaurantNameEn

    try {
      await sendLowStockAlertEmail({
        to: user.email.trim(),
        recipientName: user.name,
        restaurantName,
        itemName: p.itemName,
        qty: p.qty,
        threshold: p.threshold,
        stockUrl: buildStockItemUrl(
          p.businessProfileId,
          p.stockItemId,
          locale,
        ),
        preferredLocale: locale,
      })
    } catch (err) {
      console.error(
        '[hisabi-pos:stock] low-stock email to user failed',
        user.id,
        err,
      )
    }
  }
}
