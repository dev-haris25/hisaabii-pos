import { jsonOk, jsonError } from '@/lib/api/json-response'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { prisma } from '@/lib/prisma'
import { applyDuePromotions } from '@/lib/hr/promotions/apply-due-promotions'
import { mapPromotionsToJson } from '@/lib/hr/promotions/map-promotion-to-json'
import { employeeUpsertBodySchema } from '@/lib/hr/employees/employee-body-schema'
import { mapEmployeeToJson } from '@/lib/hr/employees/map-employee-to-json'
import { resolveEmployeeDocumentStorageAfterUpsert } from '@/lib/hr/employees/resolve-employee-document-storage'
import {
  assertEmployeeForeignKeys,
  employeeDetailInclude,
  employeeDocumentStorageErrorResponse,
  employeePrismaDataFromParsed,
} from '@/lib/hr/employees/employee-route-helpers'
import { createEmployeeInvitation } from '@/lib/hr/employees/create-employee-invitation'
import { replaceMembershipRoles } from '@/lib/hr/employees/replace-membership-roles'
import { computeEmployeeBalance } from '@/lib/hr/compute-employee-balance'
import { ensureSystemAdvancePayslipCategory } from '@/lib/hr/payslip-categories/system-advance-category'
import { notifyPosAudience } from '@/lib/notifications/notify-owner-and-actor'
import {
  ensurePredefinedRolesExist,
  rolesRequireNoLogin,
} from '@/lib/rbac/seed-predefined-roles'
import { employeeExcludeOwnerWhere } from '@/lib/rbac/owner-admin-gates'

/** @param {import('next/server').NextRequest} request @param {{ params: Promise<{ id: string }> }} ctx */
export async function GET(request, ctx) {
  const auth = await authorizeBusinessRequest(request)
  if (auth.error) return auth.error
  const { profile } = auth
  const { id } = await ctx.params

  const item = await prisma.employee.findFirst({
    where: {
      id,
      businessProfileId: profile.id,
      ...WHERE_NOT_DELETED,
      ...employeeExcludeOwnerWhere(profile),
    },
    include: employeeDetailInclude,
  })
  if (!item) return jsonError(404, 'NOT_FOUND', 'Employee not found')

  await applyDuePromotions(prisma, id)

  const refreshed = await prisma.employee.findFirst({
    where: {
      id,
      businessProfileId: profile.id,
      ...WHERE_NOT_DELETED,
      ...employeeExcludeOwnerWhere(profile),
    },
    include: employeeDetailInclude,
  })
  if (!refreshed) return jsonError(404, 'NOT_FOUND', 'Employee not found')

  await ensureSystemAdvancePayslipCategory(profile.id)

  const [salarySlips, payments, advanceDeductionLines, promotions] = await Promise.all([
    prisma.salarySlip.findMany({
      where: { employeeId: id, businessProfileId: profile.id, ...WHERE_NOT_DELETED },
      orderBy: { slipDate: 'desc' },
      take: 50,
      select: {
        id: true,
        slipDate: true,
        voucherNumber: true,
        netTotal: true,
      },
    }),
    prisma.employeePayment.findMany({
      where: { employeeId: id, businessProfileId: profile.id, ...WHERE_NOT_DELETED },
      orderBy: { paymentDate: 'desc' },
      take: 50,
      select: {
        id: true,
        paymentDate: true,
        paymentType: true,
        amount: true,
        payPeriod: true,
        paymentMethod: true,
        remarks: true,
      },
    }),
    prisma.salarySlipLine.findMany({
      where: {
        categoryType: 'deduction',
        payslipCategory: {
          name: { equals: 'Advance', mode: 'insensitive' },
        },
        salarySlip: {
          employeeId: id,
          businessProfileId: profile.id,
          ...WHERE_NOT_DELETED,
        },
      },
      select: {
        id: true,
        total: true,
        description: true,
        payslipCategory: { select: { id: true, name: true } },
        salarySlip: { select: { id: true, voucherNumber: true, slipDate: true } },
      },
      orderBy: [{ salarySlip: { slipDate: 'desc' } }],
    }),
    prisma.employeePromotion.findMany({
      where: { employeeId: id, businessProfileId: profile.id, ...WHERE_NOT_DELETED },
      orderBy: [{ effectiveFrom: 'desc' }, { promotedAt: 'desc' }],
    }),
  ])

  const balance = computeEmployeeBalance({
    salarySlips,
    payments,
    advanceDeductionLines,
  })

  return jsonOk({
    item: mapEmployeeToJson(refreshed),
    balance,
    salarySlips,
    payments,
    promotions: mapPromotionsToJson(promotions),
    advanceDeductionLines: advanceDeductionLines.map((line) => ({
      id: line.id,
      total: line.total,
      description: line.description,
      payslipCategoryName: line.payslipCategory?.name ?? null,
      salarySlipId: line.salarySlip.id,
      voucherNumber: line.salarySlip.voucherNumber,
      slipDate: line.salarySlip.slipDate.toISOString(),
    })),
  })
}

/** @param {import('next/server').NextRequest} request @param {{ params: Promise<{ id: string }> }} ctx */
export async function PATCH(request, ctx) {
  const auth = await authorizeBusinessRequest(request)
  if (auth.error) return auth.error
  const { session, profile } = auth
  const { id } = await ctx.params

  const existing = await prisma.employee.findFirst({
    where: {
      id,
      businessProfileId: profile.id,
      ...WHERE_NOT_DELETED,
      ...employeeExcludeOwnerWhere(profile),
    },
    include: employeeDetailInclude,
  })
  if (!existing) return jsonError(404, 'NOT_FOUND', 'Employee not found')

  let body
  try {
    body = await request.json()
  } catch {
    return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
  }

  const parsed = employeeUpsertBodySchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, 'VALIDATION_ERROR', 'Invalid input')
  }

  const fk = await assertEmployeeForeignKeys(prisma, profile.id, {
    ...parsed.data,
    employeeId: id,
  })
  if (!fk.ok) {
    return jsonError(400, 'VALIDATION_ERROR', `Invalid ${fk.field}`)
  }

  await ensurePredefinedRolesExist(profile.id)

  /** @type {string[]} */
  const roleIds = Array.isArray(parsed.data.roleIds)
    ? parsed.data.roleIds.filter(Boolean)
    : []
  const roles =
    roleIds.length > 0
      ? await prisma.role.findMany({
          where: { businessProfileId: profile.id, id: { in: roleIds } },
          select: { id: true, name: true },
        })
      : []

  if (roleIds.length > 0 && roles.length !== roleIds.length) {
    return jsonError(400, 'VALIDATION_ERROR', 'Invalid role')
  }

  let docPaths = {}
  try {
    docPaths = await resolveEmployeeDocumentStorageAfterUpsert(
      profile.id,
      id,
      {
        resumeStoragePath: existing.resumeStoragePath,
        appointmentLetterStoragePath: existing.appointmentLetterStoragePath,
        idDocumentStoragePath: existing.idDocumentStoragePath,
        photoStoragePath: existing.photoStoragePath,
        passportStoragePath: existing.passportStoragePath,
        visaStoragePath: existing.visaStoragePath,
      },
      parsed.data,
    )
  } catch (err) {
    const mapped = employeeDocumentStorageErrorResponse(err)
    if (mapped) return jsonError(mapped.status, mapped.code, mapped.message)
    return jsonError(500, 'SERVER_ERROR', 'Could not store documents')
  }

  // HR name is source of truth for the linked login User (kitchen/POS headers).
  const nextName = String(parsed.data.name ?? '').trim()
  const nameChanged = nextName !== String(existing.name ?? '').trim()
  const linkedUserId =
    existing.businessMembershipId && existing.businessMembership?.userId
      ? String(existing.businessMembership.userId)
      : null

  let updated = await prisma.$transaction(async (tx) => {
    const emp = await tx.employee.update({
      where: { id },
      data: {
        ...employeePrismaDataFromParsed(parsed.data),
        ...docPaths,
      },
      include: employeeDetailInclude,
    })
    // Skip when no login membership yet (pre-invite / no-login roles).
    if (nameChanged && linkedUserId) {
      await tx.user.update({
        where: { id: linkedUserId },
        data: { name: nextName },
      })
    }
    return emp
  }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)

  let invitationSent = false

  if (existing.businessMembershipId) {
    const prevNames = (
      existing.businessMembership?.employeeRoles ?? []
    )
      .map((er) => er.role?.name)
      .filter(Boolean)
      .sort()
    const nextNames = roles
      .map((r) => r.name)
      .filter(Boolean)
      .sort()
    const rolesChanged =
      prevNames.length !== nextNames.length ||
      prevNames.some((n, i) => n !== nextNames[i])

    await replaceMembershipRoles(prisma, existing.businessMembershipId, roleIds)
    updated = await prisma.employee.findFirst({
      where: { id, businessProfileId: profile.id, ...WHERE_NOT_DELETED },
      include: employeeDetailInclude,
    })

    if (rolesChanged) {
      const targetUserId = existing.businessMembership?.userId ?? null
      const detail = `${existing.name}: ${prevNames.join(', ') || '—'} → ${nextNames.join(', ') || '—'}`
      void notifyPosAudience({
        businessProfileId: profile.id,
        audience: 'team',
        type: 'role_changed',
        kind: 'team',
        vars: { detail },
        link: `/hr/employees/${id}`,
        dedupeKey: `role-changed:${existing.businessMembershipId}:${nextNames.join('+')}`,
        actorUserId: session.id,
        extraUserIds: targetUserId ? [targetUserId] : [],
      })
    }
  } else {
    const noLogin = rolesRequireNoLogin(roles.map((r) => r.name))
    const inviteEmail = String(
      parsed.data.inviteEmail || parsed.data.emailOfficial || '',
    )
      .trim()
      .toLowerCase()

    if (!noLogin) {
      if (!inviteEmail) {
        return jsonError(
          400,
          'VALIDATION_ERROR',
          'Email is required when assigning login roles',
        )
      }
      const inviteResult = await createEmployeeInvitation({
        profile,
        employee: updated,
        inviteEmail,
        roles,
        invitedByUserId: session.id,
        request,
      })
      if (inviteResult.alreadyMember) {
        return jsonError(409, 'ALREADY_MEMBER', 'This user is already a member')
      }
      invitationSent = inviteResult.invitationSent === true
      if (inviteResult.emailFailed) {
        return jsonError(500, 'EMAIL_FAILED', 'Could not send invitation email')
      }
    }
  }

  if (!updated) return jsonError(404, 'NOT_FOUND', 'Employee not found')

  return jsonOk({
    item: mapEmployeeToJson(updated),
    invitationSent,
  })
}

/** @param {import('next/server').NextRequest} request @param {{ params: Promise<{ id: string }> }} ctx */
export async function DELETE(request, ctx) {
  const auth = await authorizeBusinessRequest(request)
  if (auth.error) return auth.error
  const { profile } = auth
  const { id } = await ctx.params

  const existing = await prisma.employee.findFirst({
    where: {
      id,
      businessProfileId: profile.id,
      ...WHERE_NOT_DELETED,
      ...employeeExcludeOwnerWhere(profile),
    },
    select: { id: true },
  })
  if (!existing) return jsonError(404, 'NOT_FOUND', 'Employee not found')

  await prisma.employee.update({
    where: { id },
    data: { deletedAt: new Date() },
  })

  return jsonOk({ deleted: true })
}
