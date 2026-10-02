import { NextResponse } from 'next/server'

import { jsonError } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { readBusinessLogoFile } from '@/lib/auth/save-business-logo'
import { prisma } from '@/lib/prisma'

/**
 * Public restaurant logo for E-Waiter white-label (unauthenticated).
 * Slug + onboarded check mirrors `/api/public/queue/[slug]`.
 */
export async function GET(_request, context) {
  try {
    const { slug } = await context.params
    const key = String(slug ?? '').trim()
    if (!key) {
      return jsonError(404, 'NOT_FOUND', 'Logo not found')
    }

    const profile = await prisma.businessProfile.findUnique({
      where: { slug: key },
      select: {
        logoStoragePath: true,
        logoMimeType: true,
        onboardingCompletedAt: true,
      },
    })
    if (!profile?.onboardingCompletedAt) {
      return jsonError(404, 'NOT_FOUND', 'Logo not found')
    }
    if (!profile.logoStoragePath) {
      return jsonError(404, 'NOT_FOUND', 'Logo not found')
    }

    try {
      const buf = await readBusinessLogoFile(profile.logoStoragePath)
      return new NextResponse(buf, {
        headers: {
          'Content-Type': profile.logoMimeType || 'application/octet-stream',
          'Cache-Control': 'public, max-age=3600',
        },
      })
    } catch {
      return jsonError(404, 'NOT_FOUND', 'Logo not found')
    }
  } catch (err) {
    return handleRouteError(err, 'GET /api/public/business/[slug]/logo')
  }
}
