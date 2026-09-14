import { userCanAccessBusinessProfile } from '@/lib/auth/accessible-business-profiles'
import { requirePosRestaurant } from '@/lib/auth/require-pos-app-user'
import { downloadMenuItemImageFromStorage } from '@/lib/menu/menu-item-image-storage'
import { prisma } from '@/lib/prisma'

/** @param {import('next/server').NextRequest} _request @param {{ params: Promise<{ id: string }> }} ctx */
export async function GET(_request, ctx) {
  const auth = await requirePosRestaurant()
  if (auth.error) return auth.error
  const { id } = await ctx.params
  if (!id) {
    return new Response(null, { status: 400 })
  }

  const row = await prisma.menuItem.findFirst({
    where: { id },
    select: { imageUrl: true, businessProfileId: true },
  })

  if (!row?.imageUrl) {
    return new Response(null, { status: 404 })
  }

  const canAccess = await userCanAccessBusinessProfile(
    auth.session.id,
    row.businessProfileId,
  )
  if (!canAccess) {
    return new Response(null, { status: 404 })
  }

  const downloaded = await downloadMenuItemImageFromStorage(row.imageUrl)
  if (!downloaded?.data.length) {
    return new Response(null, { status: 404 })
  }

  return new Response(downloaded.data, {
    status: 200,
    headers: {
      'Content-Type': downloaded.mimeType,
      'Cache-Control': 'private, no-store',
    },
  })
}
