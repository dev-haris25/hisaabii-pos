import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { NextResponse } from 'next/server'

import { userCanAccessBusinessProfile } from '@/lib/auth/accessible-business-profiles'
import { getSessionUser } from '@/lib/auth/get-session-user'
import { jsonError } from '@/lib/api/json-response'
import { prisma } from '@/lib/prisma'

/**
 * Serve the restaurant logo from public/uploads for a membership-accessible profile.
 */
export async function GET(_request, context) {
  const session = await getSessionUser()
  if (!session) {
    return jsonError(401, 'UNAUTHORIZED', 'Not signed in')
  }

  const { id } = await context.params
  const canAccess = await userCanAccessBusinessProfile(session.id, id)
  if (!canAccess) {
    return jsonError(403, 'FORBIDDEN', 'Not allowed')
  }

  const profile = await prisma.businessProfile.findUnique({
    where: { id },
    select: { logoStoragePath: true, logoMimeType: true },
  })
  if (!profile?.logoStoragePath) {
    return jsonError(404, 'NOT_FOUND', 'No logo')
  }

  const rel = profile.logoStoragePath.replace(/^\//, '')
  const abs = path.join(process.cwd(), 'public', rel)
  try {
    const buf = await readFile(abs)
    return new NextResponse(buf, {
      headers: {
        'Content-Type': profile.logoMimeType || 'application/octet-stream',
        'Cache-Control': 'private, max-age=60',
      },
    })
  } catch {
    return jsonError(404, 'NOT_FOUND', 'Logo file missing')
  }
}
