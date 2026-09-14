import { z } from 'zod'
import { jsonError, jsonOk } from '@/lib/api/json-response'
import { getSessionUser } from '@/lib/auth/get-session-user'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { hasNumberOrSpecial } from '@/lib/auth/password-rules'
import { prisma } from '@/lib/prisma'

const bodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
})

/** @param {import('next/server').NextRequest} request */
export async function POST(request) {
  const session = await getSessionUser()
  if (!session) return jsonError(401, 'UNAUTHORIZED', 'Not signed in')

  let body
  try {
    body = await request.json()
  } catch {
    return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, 'VALIDATION_ERROR', 'Invalid input')
  }

  if (!hasNumberOrSpecial(parsed.data.newPassword)) {
    return jsonError(400, 'WEAK_PASSWORD', 'Password does not meet requirements')
  }

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { passwordHash: true },
  })
  if (!user) return jsonError(404, 'NOT_FOUND', 'User not found')

  if (!verifyPassword(parsed.data.currentPassword, user.passwordHash)) {
    return jsonError(400, 'INVALID_PASSWORD', 'Current password is incorrect')
  }

  await prisma.user.update({
    where: { id: session.id },
    data: { passwordHash: hashPassword(parsed.data.newPassword) },
  })

  return jsonOk({ ok: true })
}
