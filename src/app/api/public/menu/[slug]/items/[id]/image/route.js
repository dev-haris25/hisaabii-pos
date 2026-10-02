import { jsonError } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { downloadMenuItemImageFromStorage } from '@/lib/menu/menu-item-image-storage'
import { prisma } from '@/lib/prisma'

/**
 * Public menu-item image for E-Waiter white-label (unauthenticated).
 * Slug + onboarded check mirrors `/api/public/queue/[slug]`.
 * Item must belong to the slug’s restaurant (tenant scoped).
 */
export async function GET(_request, context) {
  try {
    const { slug, id } = await context.params
    const key = String(slug ?? '').trim()
    const itemId = String(id ?? '').trim()
    if (!key || !itemId) {
      return jsonError(404, 'NOT_FOUND', 'Image not found')
    }

    const profile = await prisma.businessProfile.findUnique({
      where: { slug: key },
      select: {
        id: true,
        onboardingCompletedAt: true,
      },
    })
    if (!profile?.onboardingCompletedAt) {
      return jsonError(404, 'NOT_FOUND', 'Image not found')
    }

    const row = await prisma.menuItem.findFirst({
      where: {
        id: itemId,
        businessProfileId: profile.id,
      },
      select: { imageUrl: true },
    })
    if (!row?.imageUrl) {
      return jsonError(404, 'NOT_FOUND', 'Image not found')
    }

    const downloaded = await downloadMenuItemImageFromStorage(row.imageUrl)
    if (!downloaded?.data.length) {
      return jsonError(404, 'NOT_FOUND', 'Image not found')
    }

    return new Response(downloaded.data, {
      status: 200,
      headers: {
        'Content-Type': downloaded.mimeType,
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (err) {
    return handleRouteError(
      err,
      'GET /api/public/menu/[slug]/items/[id]/image',
    )
  }
}
