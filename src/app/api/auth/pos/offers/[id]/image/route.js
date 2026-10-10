import { jsonError } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { requirePosRestaurant } from '@/lib/auth/require-pos-app-user'
import { downloadOfferImage } from '@/lib/offers/offer-image-storage'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/auth/pos/offers/[id]/image?kind=banner|image
 * Offer images for POS cards and the admin form (tenant scoped).
 */
export async function GET(request, context) {
  try {
    const auth = await requirePosRestaurant()
    if (auth.error) return auth.error
    const { id } = await context.params
    const kind =
      new URL(request.url).searchParams.get('kind') === 'banner' ? 'banner' : 'image'

    const row = await prisma.offer.findFirst({
      where: { id, businessProfileId: auth.profileId },
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
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/pos/offers/[id]/image')
  }
}
