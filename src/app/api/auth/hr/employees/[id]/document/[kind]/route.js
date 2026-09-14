import { storageBinaryResponse } from '@/lib/api/storage-binary-response'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { prisma } from '@/lib/prisma'
import { EMPLOYEE_DOCUMENT_STORAGE_FIELDS } from '@/lib/hr/employees/resolve-employee-document-storage'
import { downloadFile, guessMimeFromStoragePath } from '@/lib/storage/local-storage'

/** @type {Set<string>} */
const ALLOWED_KINDS = new Set([
  'resume',
  'appointment-letter',
  'id-document',
  'passport',
  'visa',
])

/**
 * @param {import('next/server').NextRequest} _request
 * @param {{ params: Promise<{ id: string, kind: string }> }} ctx
 */
export async function GET(request, ctx) {
  const auth = await authorizeBusinessRequest(request)
  if (auth.error) return auth.error
  const { profile } = auth
  const { id, kind } = await ctx.params
  if (!id || typeof id !== 'string') return new Response(null, { status: 400 })
  if (!kind || !ALLOWED_KINDS.has(kind)) return new Response(null, { status: 400 })

  const field = EMPLOYEE_DOCUMENT_STORAGE_FIELDS[kind]

  const row = await prisma.employee.findFirst({
    where: {
      id,
      businessProfileId: profile.id,
      ...WHERE_NOT_DELETED,
    },
    select: { [field]: true },
  })

  const storagePath = row?.[field]
  if (!storagePath) return new Response(null, { status: 404 })

  let data
  try {
    data = await downloadFile(storagePath)
  } catch {
    return new Response(null, { status: 404 })
  }
  if (!data?.length) return new Response(null, { status: 404 })

  return storageBinaryResponse(data, {
    contentType: guessMimeFromStoragePath(storagePath),
  })
}
