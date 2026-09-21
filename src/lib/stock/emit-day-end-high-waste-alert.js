import { sendDayEndHighWasteEmail } from '@/lib/email/send-high-waste-email'
import { notifyPosAudience } from '@/lib/notifications/notify-owner-and-actor'
import { resolveNotificationRecipients } from '@/lib/notifications/resolve-notification-recipients'
import { reportDateKey } from '@/lib/stock/day-end-report'
import { prisma } from '@/lib/prisma'

/**
 * @param {string} reportId
 * @param {'ar' | 'en'} locale
 */
function buildDayEndUrl(reportId, locale) {
  const base = (
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4517'
  ).replace(/\/$/, '')
  return `${base}/${locale}/stock/day-end/${reportId}`
}

/**
 * @param {string | null | undefined} raw
 * @param {'ar' | 'en'} locale
 */
function analysisForLocale(raw, locale) {
  const text = String(raw ?? '').trim()
  if (!text) return ''
  const marker = '<<<AR>>>'
  const idx = text.indexOf(marker)
  if (idx < 0) return text
  const en = text.slice(0, idx).trim()
  const ar = text.slice(idx + marker.length).trim()
  return locale === 'ar' ? ar || en : en || ar
}

/**
 * One in-app notification and one email for the day when any line is high.
 * Email goes only to owner/admin who turned on emailHighWasteReports.
 *
 * @param {{
 *   businessProfileId: string
 *   report: {
 *     id: string
 *     reportDate: Date | string
 *     aiAnalysis?: string | null
 *     lines?: Array<{
 *       wasteSeverity?: string | null
 *       nameEn?: string | null
 *       nameAr?: string | null
 *     }>
 *   }
 * }} p
 */
export async function maybeEmitDayEndHighWasteAlert(p) {
  const high = (p.report.lines ?? []).filter(
    (line) => line.wasteSeverity === 'high',
  )
  if (high.length === 0) return

  const date =
    p.report.reportDate instanceof Date
      ? reportDateKey(p.report.reportDate)
      : String(p.report.reportDate).slice(0, 10)
  const items = high
    .map((line) => line.nameEn || line.nameAr || '—')
    .join(', ')

  await notifyPosAudience({
    businessProfileId: p.businessProfileId,
    audience: 'ownerAdmin',
    kind: 'salesOps',
    type: 'day_end_waste_high',
    vars: { date, items },
    link: `/stock/day-end/${p.report.id}`,
    dedupeKey: `day_end_waste_high:${p.report.id}`,
  })

  try {
    await sendDayEndHighWasteEmails({
      businessProfileId: p.businessProfileId,
      reportId: p.report.id,
      reportDate: date,
      itemNames: items,
      analysis: p.report.aiAnalysis,
    })
  } catch (err) {
    console.error('[hisabi-pos:stock] day-end high-waste email failed', err)
  }
}

/**
 * @param {{
 *   businessProfileId: string
 *   reportId: string
 *   reportDate: string
 *   itemNames: string
 *   analysis?: string | null
 * }} p
 */
async function sendDayEndHighWasteEmails(p) {
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

  for (const row of optedIn) {
    const user = row.user
    if (!user?.email?.trim()) continue
    const locale = user.preferredLocale === 'ar' ? 'ar' : 'en'
    try {
      await sendDayEndHighWasteEmail({
        to: user.email.trim(),
        recipientName: user.name,
        restaurantName: locale === 'ar' ? restaurantNameAr : restaurantNameEn,
        reportDate: p.reportDate,
        itemNames: p.itemNames,
        analysis: analysisForLocale(p.analysis, locale),
        reportUrl: buildDayEndUrl(p.reportId, locale),
        preferredLocale: locale,
      })
    } catch (err) {
      console.error(
        '[hisabi-pos:stock] day-end high-waste email to user failed',
        user.id,
        err,
      )
    }
  }
}
