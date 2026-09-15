import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { loadPublicCustomerQueue } from '@/lib/orders/load-public-queue'
import { prisma } from '@/lib/prisma'

export async function GET(_request, context) {
  try {
    const { slug } = await context.params
    const key = String(slug ?? '').trim()
    if (!key) {
      return jsonError(404, 'NOT_FOUND', 'Queue not found')
    }

    const profile = await prisma.businessProfile.findUnique({
      where: { slug: key },
      select: {
        id: true,
        companyNameAr: true,
        companyNameEn: true,
        customerQueueLocale: true,
        onboardingCompletedAt: true,
      },
    })
    if (!profile?.onboardingCompletedAt) {
      return jsonError(404, 'NOT_FOUND', 'Queue not found')
    }

    const board = await loadPublicCustomerQueue(profile.id)
    return jsonOk({
      ...board,
      restaurantNameAr: profile.companyNameAr,
      restaurantNameEn: profile.companyNameEn,
      locale: profile.customerQueueLocale,
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/public/queue/[slug]')
  }
}
