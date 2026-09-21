import { sendHighWasteAlertEmail } from '@/lib/email/send-high-waste-email'
import { notifyPosAudience } from '@/lib/notifications/notify-owner-and-actor'
import { resolveNotificationRecipients } from '@/lib/notifications/resolve-notification-recipients'
import { displayedKitchenUsedQty } from '@/lib/stock/kitchen-waste-ai-result'
import { stockUnitLabel } from '@/lib/stock/units'
import { prisma } from '@/lib/prisma'

/**
 * @param {string} allocationId
 * @param {'ar' | 'en'} locale
 */
function buildWastageUrl(allocationId, locale) {
  const base = (
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  ).replace(/\/$/, '')
  return `${base}/${locale}/stock/wastage/${allocationId}`
}

/**
 * In-app alert for owner + Admin when AI grades a closed batch as high waste.
 *
 * @param {{
 *   businessProfileId: string
 *   allocation: {
 *     id: string
 *     quantityWaste?: string | null
 *     wasteSeverity?: string | null
 *     stockItem?: {
 *       nameAr?: string
 *       nameEn?: string | null
 *       unit?: string
 *     } | null
 *   }
 * }} p
 */
export async function maybeEmitHighWasteAlert(p) {
  const { businessProfileId, allocation } = p
  if (allocation.wasteSeverity !== 'high') return

  const stock = allocation.stockItem
  const name = stock?.nameEn || stock?.nameAr || '—'
  const unit = stockUnitLabel(/** @type {string | undefined} */ (stock?.unit))
  const waste = `${allocation.quantityWaste ?? '0'} ${unit}`

  await notifyPosAudience({
    businessProfileId,
    audience: 'ownerAdmin',
    kind: 'salesOps',
    type: 'kitchen_waste_high',
    vars: { name, waste },
    link: `/stock/wastage/${allocation.id}`,
    dedupeKey: `kitchen_waste_high:${allocation.id}`,
  })

  try {
    await sendHighWasteEmails({
      businessProfileId,
      allocation,
      itemName: name,
      waste,
    })
  } catch (err) {
    console.error('[hisabi-pos:stock] high-waste email failed', err)
  }
}

/**
 * Emails only owner/admin who turned on the per-user restaurant setting.
 * @param {{
 *   businessProfileId: string
 *   itemName: string
 *   waste: string
 *   allocation: {
 *     id: string
 *     quantityIssued?: string | null
 *     quantityUsed?: string | null
 *     quantityWaste?: string | null
 *     aiQuantityUsed?: string | null
 *     aiAnalysis?: string | null
 *     wasteIsAiEstimate?: boolean | null
 *     isBulk?: boolean | null
 *     isBulkAtClose?: boolean | null
 *     stockItem?: { unit?: string } | null
 *   }
 * }} p
 */
async function sendHighWasteEmails(p) {
  const eligibleIds = await resolveNotificationRecipients(
    p.businessProfileId,
    'ownerAdmin',
  )
  if (eligibleIds.length === 0) return

  const optedIn = await prisma.businessMembership.findMany({
    where: {
      businessProfileId: p.businessProfileId,
      userId: { in: eligibleIds },
      emailHighWasteReports: true,
      user: { active: true },
    },
    select: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          preferredLocale: true,
        },
      },
    },
  })

  if (optedIn.length === 0) return

  const profile = await prisma.businessProfile.findUnique({
    where: { id: p.businessProfileId },
    select: { companyNameAr: true, companyNameEn: true },
  })
  const restaurantNameEn =
    profile?.companyNameEn?.trim() || profile?.companyNameAr || 'Restaurant'
  const restaurantNameAr = profile?.companyNameAr || restaurantNameEn

  const unit = stockUnitLabel(
    /** @type {string | undefined} */ (p.allocation.stockItem?.unit),
  )
  const issued = `${p.allocation.quantityIssued ?? '0'} ${unit}`
  const used = `${displayedKitchenUsedQty(p.allocation)} ${unit}`
  const isBulkEstimate = p.allocation.wasteIsAiEstimate === true
  const analysis =
    typeof p.allocation.aiAnalysis === 'string' ? p.allocation.aiAnalysis : ''

  for (const row of optedIn) {
    const user = row.user
    if (!user?.email?.trim()) continue
    const locale = user.preferredLocale === 'ar' ? 'ar' : 'en'
    try {
      await sendHighWasteAlertEmail({
        to: user.email.trim(),
        recipientName: user.name,
        restaurantName: locale === 'ar' ? restaurantNameAr : restaurantNameEn,
        itemName: p.itemName,
        issued,
        used,
        waste: p.waste,
        analysis,
        isBulkEstimate,
        reportUrl: buildWastageUrl(p.allocation.id, locale),
        preferredLocale: locale,
      })
    } catch (err) {
      console.error(
        '[hisabi-pos:stock] high-waste email to user failed',
        user.id,
        err,
      )
    }
  }
}
