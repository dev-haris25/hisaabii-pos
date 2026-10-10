import { jsonError } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { downloadOfferImage } from '@/lib/offers/offer-image-storage'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/public/offers/[slug]/[id]/image?kind=banner|image
 * Public (QR menu) offer banner / image. Tenant scoped by slug like menu item
 * images; deleted offers are not served.
 */
export async function GET(request, context) {
  try {
    const { slug, id } = await context.params
    const key = String(slug ?? '').trim()
    const offerId = String(id ?? '').trim()
    if (!key || !offerId) return jsonError(404, 'NOT_FOUND', 'Image not found')
    const kind =
      new URL(request.url).searchParams.get('kind') === 'banner' ? 'banner' : 'image'

    const profile = await prisma.businessProfile.findUnique({
      where: { slug: key },
      select: { id: true, onboardingCompletedAt: true },
    })
    if (!profile?.onboardingCompletedAt) {
      return jsonError(404, 'NOT_FOUND', 'Image not found')
    }

    const row = await prisma.offer.findFirst({
      where: { id: offerId, businessProfileId: profile.id, deletedAt: null },
      select: { bannerImagePath: true, imagePath: true },
    })
    const path = kind === 'banner' ? row?.bannerImagePath : row?.imagePath
    if (!path) return jsonError(404, 'NOT_FOUND', 'Image not found')

    const file = await downloadOfferImage(path)
    if (!file?.data.length) return jsonError(404, 'NOT_FOUND', 'Image not found')
    return new Response(file.data, {
      status: 200,
      headers: {
        'Content-Type': file.mimeType,
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/public/offers/[slug]/[id]/image')
  }
}
