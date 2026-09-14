import { z } from 'zod'

import { AUTH_USER_SELECT, buildAuthUserFromRowAsync } from '@/lib/auth/auth-user-json'
import {
  attachSessionCookie,
  createSessionAccessToken,
} from '@/lib/auth/attach-session-cookie'
import { hashPassword } from '@/lib/auth/password'
import { hasNumberOrSpecial } from '@/lib/auth/password-rules'
import { getSessionUser } from '@/lib/auth/get-session-user'
import { verifySignedToken } from '@/lib/auth/token'
import { jsonError, jsonOk } from '@/lib/api/json-response'
import { companyDisplayNameForLocale } from '@/lib/business-profile/company-display-name'
import { hashInvitationToken } from '@/lib/hr/invitation-token'
import { notifyPosAudience } from '@/lib/notifications/notify-owner-and-actor'
import { prisma } from '@/lib/prisma'

const SESSION_MAX_AGE = 60 * 60 * 24 * 7

export const invitationAcceptBodySchema = z.object({
  token: z.string().min(1),
  name: z.string().trim().min(1).max(200).optional(),
  password: z.string().min(8).max(200).optional(),
})

/**
 * @param {string | null} token
 */
async function resolveInvitationFromToken(token) {
  if (!token) return { error: jsonError(400, 'INVALID_TOKEN', 'Invalid invitation') }

  const payload = verifySignedToken(token)
  if (
    !payload ||
    payload.purpose !== 'user_invitation' ||
    typeof payload.invitationId !== 'string' ||
    typeof payload.businessProfileId !== 'string' ||
    typeof payload.email !== 'string'
  ) {
    return { error: jsonError(400, 'INVALID_TOKEN', 'Invalid or expired invitation') }
  }

  const invitation = await prisma.userInvitation.findFirst({
    where: {
      id: payload.invitationId,
      businessProfileId: payload.businessProfileId,
      email: payload.email.toLowerCase(),
      status: 'pending',
      tokenHash: hashInvitationToken(token),
      expiresAt: { gt: new Date() },
    },
    include: {
      role: { select: { id: true, name: true } },
      businessProfile: {
        select: {
          id: true,
          companyNameAr: true,
          companyNameEn: true,
        },
      },
    },
  })

  if (!invitation) {
    return { error: jsonError(400, 'INVALID_TOKEN', 'Invalid or expired invitation') }
  }

  let employeeName = null
  if (invitation.employeeId) {
    const employee = await prisma.employee.findFirst({
      where: {
        id: invitation.employeeId,
        businessProfileId: invitation.businessProfileId,
      },
      select: { name: true },
    })
    employeeName = employee?.name?.trim() || null
  }

  return { invitation, token, payload, employeeName }
}

/** @param {string} roleIdsJson @param {string} fallbackRoleId */
function parseRoleIds(roleIdsJson, fallbackRoleId) {
  try {
    const parsed = JSON.parse(roleIdsJson || '[]')
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.filter((id) => typeof id === 'string' && id.trim())
    }
  } catch {
    // ignore
  }
  return [fallbackRoleId]
}

/** @param {import('next/server').NextRequest} request */
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')
  const resolved = await resolveInvitationFromToken(token)
  if (resolved.error) return resolved.error

  const { invitation, employeeName } = resolved
  const existingUser = await prisma.user.findUnique({
    where: { email: invitation.email },
    select: { id: true, email: true, name: true },
  })

  const session = await getSessionUser()

  const locale =
    request.headers.get('x-next-intl-locale') ||
    request.headers.get('accept-language')?.split(',')[0]?.slice(0, 2) ||
    'en'

  let roleNames = [invitation.role.name]
  try {
    const ids = parseRoleIds(invitation.roleIdsJson, invitation.roleId)
    const roles = await prisma.role.findMany({
      where: { id: { in: ids }, businessProfileId: invitation.businessProfileId },
      select: { name: true },
    })
    if (roles.length) roleNames = roles.map((r) => r.name)
  } catch {
    // keep primary role name
  }

  return jsonOk({
    email: invitation.email,
    roleName: roleNames.join(', '),
    companyName:
      companyDisplayNameForLocale(invitation.businessProfile, locale) ||
      invitation.businessProfile.companyNameEn ||
      invitation.businessProfile.companyNameAr,
    requiresSignup: !existingUser,
    /** Name already on the HR employee — client should not ask again. */
    inviteeName: employeeName,
    requiresName: !existingUser && !employeeName,
    existingUserName: existingUser?.name ?? null,
    isLoggedIn: Boolean(session),
    loggedInEmail: session?.email ?? null,
  })
}

/** @param {import('next/server').NextRequest} request */
export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
  }

  const parsed = invitationAcceptBodySchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, 'VALIDATION_ERROR', 'Invalid input')
  }

  const resolved = await resolveInvitationFromToken(parsed.data.token)
  if (resolved.error) return resolved.error

  const { invitation, employeeName } = resolved
  const session = await getSessionUser()

  let userId = session?.id ?? null

  const existingUser = await prisma.user.findUnique({
    where: { email: invitation.email },
    select: { id: true, email: true },
  })

  if (existingUser) {
    if (session && session.email.toLowerCase() !== invitation.email) {
      return jsonError(
        403,
        'WRONG_ACCOUNT',
        'Please sign in with the invited email address',
      )
    }
    if (!session) {
      return jsonError(401, 'UNAUTHORIZED', 'Please sign in to accept this invitation')
    }
    userId = existingUser.id
  } else {
    if (!parsed.data.password) {
      return jsonError(400, 'VALIDATION_ERROR', 'Password is required')
    }
    if (!hasNumberOrSpecial(parsed.data.password)) {
      return jsonError(400, 'WEAK_PASSWORD', 'Password does not meet requirements')
    }

    const nameFromBody = String(parsed.data.name ?? '').trim()
    const resolvedName = employeeName || nameFromBody
    if (!resolvedName) {
      return jsonError(400, 'VALIDATION_ERROR', 'Name is required')
    }

    const created = await prisma.user.create({
      data: {
        email: invitation.email,
        name: resolvedName,
        passwordHash: hashPassword(parsed.data.password),
        emailVerified: true,
        activeBusinessProfileId: invitation.businessProfileId,
      },
    })
    userId = created.id
  }

  const roleIds = parseRoleIds(invitation.roleIdsJson, invitation.roleId)

  const membership = await prisma.businessMembership.upsert({
    where: {
      userId_businessProfileId: {
        userId,
        businessProfileId: invitation.businessProfileId,
      },
    },
    create: {
      userId,
      businessProfileId: invitation.businessProfileId,
    },
    update: {},
  })

  for (const roleId of roleIds) {
    await prisma.employeeRole.upsert({
      where: {
        businessMembershipId_roleId: {
          businessMembershipId: membership.id,
          roleId,
        },
      },
      create: {
        businessMembershipId: membership.id,
        roleId,
      },
      update: {},
    })
  }

  if (invitation.employeeId) {
    await prisma.employee.updateMany({
      where: {
        id: invitation.employeeId,
        businessProfileId: invitation.businessProfileId,
      },
      data: { businessMembershipId: membership.id },
    })
  }

  await prisma.userInvitation.update({
    where: { id: invitation.id },
    data: { status: 'accepted' },
  })

  void notifyPosAudience({
    businessProfileId: invitation.businessProfileId,
    audience: 'team',
    type: 'member_joined',
    kind: 'team',
    vars: {
      detail: employeeName || invitation.email,
    },
    link: invitation.employeeId
      ? `/hr/employees/${invitation.employeeId}`
      : '/hr/employees',
    dedupeKey: `member-joined:${membership.id}`,
    extraUserIds: [userId],
  })

  await prisma.user.update({
    where: { id: userId },
    data: { activeBusinessProfileId: invitation.businessProfileId },
  })

  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: AUTH_USER_SELECT,
  })
  if (!row) {
    return jsonError(500, 'SERVER_ERROR', 'User not found')
  }

  const user = await buildAuthUserFromRowAsync(row)

  /** @type {{ user: typeof user, token?: string }} */
  const payload = { user }
  if (!session) {
    const token = createSessionAccessToken(userId, SESSION_MAX_AGE)
    payload.token = token
    const response = jsonOk(payload)
    attachSessionCookie(response, userId, SESSION_MAX_AGE, token)
    return response
  }

  return jsonOk(payload)
}
