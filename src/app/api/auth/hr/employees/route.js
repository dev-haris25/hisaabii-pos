import { jsonOk, jsonError } from '@/lib/api/json-response'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import {
  buildPaginationMeta,
  parseListPagination,
  shouldPaginateListRequest,
} from '@/lib/list-views/parse-list-pagination'
import { wantsListStatsOnly } from '@/lib/list-views/wants-list-stats-only'
import { prisma } from '@/lib/prisma'
import { applyDuePromotionsForProfile } from '@/lib/hr/promotions/apply-due-promotions'
import { employeeUpsertBodySchema } from '@/lib/hr/employees/employee-body-schema'
import { mapEmployeesToJson, mapEmployeeToJson } from '@/lib/hr/employees/map-employee-to-json'
import { resolveEmployeeDocumentStorageAfterUpsert } from '@/lib/hr/employees/resolve-employee-document-storage'
import {
  assertEmployeeForeignKeys,
  employeeDocumentStorageErrorResponse,
  employeeListInclude,
  employeePrismaDataFromParsed,
} from '@/lib/hr/employees/employee-route-helpers'
import { createEmployeeInvitation } from '@/lib/hr/employees/create-employee-invitation'
import {
  ensurePredefinedRolesExist,
  rolesRequireNoLogin,
} from '@/lib/rbac/seed-predefined-roles'
import { employeeExcludeOwnerWhere } from '@/lib/rbac/owner-admin-gates'

/** @param {import('next/server').NextRequest} request */
export async function GET(request) {
  const auth = await authorizeBusinessRequest(request)
  if (auth.error) return auth.error
  const { profile } = auth
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') ?? 'all'
  const search = (searchParams.get('search') ?? '').trim()
  const activeOnly = searchParams.get('activeOnly') === 'true'
  const paginate = shouldPaginateListRequest(searchParams)
  const { page, limit, skip } = parseListPagination(searchParams)

  const ownerVisibility = employeeExcludeOwnerWhere(profile)

  const where = {
    businessProfileId: profile.id,
    ...WHERE_NOT_DELETED,
    ...ownerVisibility,
  }

  if (status !== 'all') where.status = status
  if (activeOnly) where.status = 'active'
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { emailOfficial: { contains: search, mode: 'insensitive' } },
      { mobileOfficial: { contains: search, mode: 'insensitive' } },
      { idNumber: { contains: search, mode: 'insensitive' } },
    ]
  }

  await applyDuePromotionsForProfile(prisma, profile.id)

  const statsWhere = {
    businessProfileId: profile.id,
    ...WHERE_NOT_DELETED,
    ...ownerVisibility,
  }

  async function loadStats() {
    const [total, activeCount] = await Promise.all([
      prisma.employee.count({ where: statsWhere }),
      prisma.employee.count({ where: { ...statsWhere, status: 'active' } }),
    ])
    return { total, activeCount }
  }

  if (wantsListStatsOnly(searchParams)) {
    return jsonOk({ stats: await loadStats() })
  }

  if (paginate) {
    const [total, rows] = await Promise.all([
      prisma.employee.count({ where }),
      prisma.employee.findMany({
        where,
        include: employeeListInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ])
    return jsonOk({
      items: mapEmployeesToJson(rows),
      pagination: buildPaginationMeta(page, limit, total),
      stats: await loadStats(),
    })
  }

  const rows = await prisma.employee.findMany({
    where,
    include: employeeListInclude,
    orderBy: { createdAt: 'desc' },
  })
  return jsonOk({ items: mapEmployeesToJson(rows), stats: await loadStats() })
}

/** @param {import('next/server').NextRequest} request */
export async function POST(request) {
  const auth = await authorizeBusinessRequest(request)
  if (auth.error) return auth.error
  const { session, profile } = auth

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

  const fk = await assertEmployeeForeignKeys(prisma, profile.id, parsed.data)
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

  const roleNames = roles.map((r) => r.name)
  const noLogin = rolesRequireNoLogin(roleNames)
  const inviteEmail = String(
    parsed.data.inviteEmail || parsed.data.emailOfficial || '',
  )
    .trim()
    .toLowerCase()

  if (!noLogin && !inviteEmail) {
    return jsonError(400, 'VALIDATION_ERROR', 'Email is required when assigning login roles')
  }

  const base = employeePrismaDataFromParsed(parsed.data)

  let created
  try {
    created = await prisma.employee.create({
      data: {
        businessProfileId: profile.id,
        ...base,
      },
      include: employeeListInclude,
    })
  } catch (err) {
    console.error('[hisabi-pos:hr:employees] create failed', err)
    return jsonError(500, 'SERVER_ERROR', 'Could not create employee')
  }

  try {
    const docPaths = await resolveEmployeeDocumentStorageAfterUpsert(
      profile.id,
      created.id,
      {},
      parsed.data,
    )
    if (Object.keys(docPaths).length > 0) {
      created = await prisma.employee.update({
        where: { id: created.id },
        data: docPaths,
        include: employeeListInclude,
      })
    }
  } catch (err) {
    await prisma.employee.delete({ where: { id: created.id } }).catch(() => {})
    const mapped = employeeDocumentStorageErrorResponse(err)
    if (mapped) {
      return jsonError(mapped.status, mapped.code, mapped.message)
    }
    return jsonError(500, 'SERVER_ERROR', 'Could not store documents')
  }

  let invitationSent = false
  if (!noLogin && inviteEmail) {
    const inviteResult = await createEmployeeInvitation({
      profile,
      employee: created,
      inviteEmail,
      roles,
      invitedByUserId: session.id,
      request,
    })
    if (inviteResult.alreadyMember) {
      await prisma.employee.delete({ where: { id: created.id } }).catch(() => {})
      return jsonError(409, 'ALREADY_MEMBER', 'This user is already a member')
    }
    invitationSent = inviteResult.invitationSent === true
    if (inviteResult.emailFailed) {
      return jsonError(500, 'EMAIL_FAILED', 'Could not send invitation email')
    }
  }

  return jsonOk({
    item: mapEmployeeToJson(created),
    invitationSent,
  })
}
