import { createMongoAbility } from '@casl/ability'

import {
  ADMIN_ROLE_NAME,
  CASHIER_ROLE_NAME,
} from '@/lib/rbac/permission-registry'
import { ensurePredefinedRolesSynced } from '@/lib/rbac/seed-predefined-roles'
import { cashierDocumentWindowStart } from '@/lib/rbac/cashier-invoice-window'
import { prisma } from '@/lib/prisma'

/**
 * @param {Array<{ action: string, subject: string, conditions?: Record<string, unknown> }>} permissions
 */
export function buildAbilityFromPermissions(permissions) {
  const rules = permissions.map((p) => {
    /** @type {{ action: string, subject: string, conditions?: Record<string, unknown> }} */
    const rule = { action: p.action, subject: p.subject }
    if (p.conditions) rule.conditions = p.conditions
    return rule
  })
  return createMongoAbility(rules)
}

/** Full access for restaurant owner and Admin role. */
export function buildOwnerAbility() {
  return createMongoAbility([{ action: 'manage', subject: 'all' }])
}

/**
 * Build CASL ability for a user's membership at a restaurant.
 * Restaurant owner (BusinessProfile.ownerUserId) and Admin role get manage/all.
 * Unions permissions across all EmployeeRole rows on the membership.
 * Cashier Invoice/CreditNote/DebitNote write rules get a server-side 24h condition.
 *
 * @param {string} userId
 * @param {string} businessProfileId
 */
export async function getAbilityForMembership(userId, businessProfileId) {
  await ensurePredefinedRolesSynced(businessProfileId)

  const profile = await prisma.businessProfile.findUnique({
    where: { id: businessProfileId },
    select: { ownerUserId: true },
  })
  if (profile?.ownerUserId === userId) {
    return buildOwnerAbility()
  }

  const membership = await prisma.businessMembership.findUnique({
    where: {
      userId_businessProfileId: { userId, businessProfileId },
    },
    include: {
      employeeRoles: {
        include: {
          role: {
            include: { permissions: true },
          },
        },
      },
    },
  })

  if (!membership) {
    return createMongoAbility([])
  }

  const roles = membership.employeeRoles.map((er) => er.role)
  if (roles.some((r) => r.isSystem && r.name === ADMIN_ROLE_NAME)) {
    return buildOwnerAbility()
  }

  const windowStart = cashierDocumentWindowStart()
  const isCashierOnlyInvoiceWindow = roles.some((r) => r.name === CASHIER_ROLE_NAME)

  /** @type {Array<{ action: string, subject: string, conditions?: Record<string, unknown> }>} */
  const permissions = []
  const seen = new Set()

  for (const role of roles) {
    for (const p of role.permissions) {
      const key = `${p.action}:${p.subject}`
      if (seen.has(key)) continue
      seen.add(key)

      const isDocWrite =
        (p.subject === 'Invoice' ||
          p.subject === 'CreditNote' ||
          p.subject === 'DebitNote') &&
        p.action !== 'read' &&
        p.action !== 'create'

      if (isCashierOnlyInvoiceWindow && isDocWrite) {
        const dateField = p.subject === 'Invoice' ? 'invoiceDate' : 'noteDate'
        permissions.push({
          action: p.action,
          subject: p.subject,
          conditions: { [dateField]: { $gte: windowStart.toISOString() } },
        })
      } else {
        permissions.push({ action: p.action, subject: p.subject })
      }
    }
  }

  return buildAbilityFromPermissions(permissions)
}

/**
 * @param {import('@casl/ability').MongoAbility} ability
 */
export function serializeAbilityRules(ability) {
  return ability.rules.map((rule) => ({
    action: rule.action,
    subject: rule.subject,
    inverted: rule.inverted ?? false,
    conditions: undefined,
    fields: rule.fields,
  }))
}
