import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { prisma } from '@/lib/prisma'

/**
 * Resolve onboarded restaurant + active table by public slug + qrToken.
 * Returns null for every invalid / tombstoned / soft-deleted case (caller → 404).
 *
 * @param {string} businessSlug
 * @param {string} qrToken
 */
export async function resolvePublicOrderTable(businessSlug, qrToken) {
  const slug = String(businessSlug ?? '').trim()
  const token = String(qrToken ?? '').trim()
  if (!slug || !token) return null

  const profile = await prisma.businessProfile.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      companyNameAr: true,
      companyNameEn: true,
      onboardingCompletedAt: true,
      updatedAt: true,
      logoStoragePath: true,
      brandPrimaryColor: true,
      brandSecondaryColor: true,
      brandAccentColor: true,
      brandBackgroundColor: true,
      brandTextColor: true,
      locationLat: true,
      locationLng: true,
      locationRadiusMeters: true,
    },
  })
  if (!profile?.onboardingCompletedAt) return null

  const table = await prisma.table.findFirst({
    where: {
      qrToken: token,
      businessProfileId: profile.id,
      ...WHERE_NOT_DELETED,
    },
    select: {
      id: true,
      name: true,
      qrToken: true,
      status: true,
      waiterCallRequestedAt: true,
      waiterCallResolvedAt: true,
    },
  })
  if (!table) return null

  return { profile, table }
}
