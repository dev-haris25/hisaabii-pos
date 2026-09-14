import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { prisma } from '@/lib/prisma'
import { downloadFile, guessMimeFromStoragePath } from '@/lib/storage/local-storage'

/**
 * @param {import('next/server').NextRequest} request
 * @param {{ params: Promise<{ id: string }> }} ctx
 */
export async function GET(request, ctx) {
  const auth = await authorizeBusinessRequest(request)
  if (auth.error) return auth.error
  const { profile } = auth

  const { id } = await ctx.params
  if (!id || typeof id !== 'string') {
    return new Response(null, { status: 400 })
  }

  const row = await prisma.salarySlip.findFirst({
    where: { id, businessProfileId: profile.id, ...WHERE_NOT_DELETED },
    select: {
      preparedBySignatureStoragePath: true,
      preparedBySignatureMimeType: true,
    },
  })

  const path = row?.preparedBySignatureStoragePath?.trim()
  if (!row || !path) {
    return new Response(null, { status: 404 })
  }

  let data
  try {
    data = await downloadFile(path)
  } catch {
    return new Response(null, { status: 404 })
  }
  if (!data?.length) {
    return new Response(null, { status: 404 })
  }

  return new Response(data, {
    status: 200,
    headers: {
      'Content-Type':
        row.preparedBySignatureMimeType ?? guessMimeFromStoragePath(path),
      'Cache-Control': 'private, no-store',
    },
  })
}
