import { jsonError, jsonOk } from '@/lib/api/json-response'
import { getSessionUser } from '@/lib/auth/get-session-user'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

/**
 * Mark the product tour as seen (started or skipped). Idempotent.
 */
export async function POST() {
  const session = await getSessionUser()
  if (!session) {
    return jsonError(401, 'UNAUTHORIZED', 'Not signed in')
  }

  const now = new Date()
  const updated = await prisma.user.update({
    where: { id: session.id },
    data: { productTourSeenAt: now },
    select: { productTourSeenAt: true },
  })

  return jsonOk({
    productTourSeenAt:
      updated.productTourSeenAt instanceof Date
        ? updated.productTourSeenAt.toISOString()
        : updated.productTourSeenAt,
  })
}
