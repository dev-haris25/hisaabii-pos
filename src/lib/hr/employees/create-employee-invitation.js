import { sendUserInvitationEmail } from '@/lib/email/send-user-invitation-email'
import { companyDisplayNameForLocale } from '@/lib/business-profile/company-display-name'
import {
  buildInvitationAcceptUrl,
  createInvitationToken,
  getInvitationExpiresAt,
  hashInvitationToken,
} from '@/lib/hr/invitation-token'
import { prisma } from '@/lib/prisma'

/**
 * Create (or replace pending) invitation linking an Employee to login roles.
 *
 * @param {{
 *   profile: { id: string, companyNameEn?: string | null, companyNameAr?: string | null }
 *   employee: { id: string, name: string }
 *   inviteEmail: string
 *   roles: Array<{ id: string, name: string }>
 *   invitedByUserId: string
 *   request: import('next/server').NextRequest
 * }} args
 * @returns {Promise<{ invitationSent: boolean, error?: import('next/server').NextResponse }>}
 */
export async function createEmployeeInvitation({
  profile,
  employee,
  inviteEmail,
  roles,
  invitedByUserId,
  request,
}) {
  const email = String(inviteEmail || '')
    .trim()
    .toLowerCase()
  if (!email || roles.length === 0) {
    return { invitationSent: false }
  }

  const existingMember = await prisma.businessMembership.findFirst({
    where: {
      businessProfileId: profile.id,
      user: { email },
    },
    select: { id: true },
  })
  if (existingMember) {
    return {
      invitationSent: false,
      alreadyMember: true,
    }
  }

  await prisma.userInvitation.deleteMany({
    where: {
      businessProfileId: profile.id,
      email,
      status: 'pending',
    },
  })

  const primaryRole = roles[0]
  const expiresAt = getInvitationExpiresAt()
  const invitation = await prisma.userInvitation.create({
    data: {
      businessProfileId: profile.id,
      email,
      roleId: primaryRole.id,
      roleIdsJson: JSON.stringify(roles.map((r) => r.id)),
      employeeId: employee.id,
      invitedByUserId,
      tokenHash: 'pending',
      expiresAt,
    },
  })

  const token = createInvitationToken({
    invitationId: invitation.id,
    businessProfileId: profile.id,
    email,
  })
  await prisma.userInvitation.update({
    where: { id: invitation.id },
    data: { tokenHash: hashInvitationToken(token) },
  })

  const locale =
    request.headers.get('x-next-intl-locale') ||
    request.headers.get('accept-language')?.split(',')[0]?.slice(0, 2) ||
    'en'
  const acceptUrl = buildInvitationAcceptUrl(
    request.headers.get('origin'),
    locale,
    token,
  )
  const companyName =
    (typeof companyDisplayNameForLocale === 'function'
      ? companyDisplayNameForLocale(profile, locale)
      : null) ||
    profile.companyNameEn ||
    profile.companyNameAr ||
    'Restaurant'

  try {
    await sendUserInvitationEmail({
      to: email,
      inviteeName: employee.name,
      companyName,
      roleName: roles.map((r) => r.name).join(', '),
      acceptUrl,
      locale,
    })
    return { invitationSent: true }
  } catch (err) {
    console.error('[hisabi-pos:hr:invite] email failed', err)
    await prisma.userInvitation.delete({ where: { id: invitation.id } }).catch(() => {})
    return { invitationSent: false, emailFailed: true }
  }
}
