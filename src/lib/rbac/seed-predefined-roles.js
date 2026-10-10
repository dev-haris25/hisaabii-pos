import {
  ACCOUNTANT_ROLE_NAME,
  ADMIN_ROLE_NAME,
  ALL_REPORT_SUBJECTS,
  CASHIER_ROLE_NAME,
  HR_REPORT_SUBJECTS,
  HR_ROLE_NAME,
  KITCHEN_BOARD_MANAGER_ROLE_NAME,
  LEGACY_KITCHEN_STAFF_ROLE_NAME,
  MANAGER_ROLE_NAME,
  QUEUE_DISPLAY_ROLE_NAME,
  STAFF_ROLE_NAME,
  crudFor,
  readFor,
} from '@/lib/rbac/permission-registry'
import { ensureSystemAdvancePayslipCategory } from '@/lib/hr/payslip-categories/system-advance-category'
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
import { prisma } from '@/lib/prisma'

/**
 * Fixed permission sets for predefined roles.
 * Admin has none stored — uses manage/all in get-ability (same as restaurant owner).
 * @returns {Record<string, Array<{ action: string, subject: string }>>}
 */
export function predefinedRolePermissionMap() {
  const allHr = [
    'Employee',
    'PayslipCategory',
    'SalarySlip',
    'EmployeePayment',
    'VisaStatus',
  ]
  const menu = ['MenuItem', 'MenuCategory']
  const stock = ['StockItem']
  const invoicesAll = ['Invoice', 'CreditNote', 'DebitNote']

  return {
    [ADMIN_ROLE_NAME]: [],
    [MANAGER_ROLE_NAME]: [
      ...crudFor([
        ...menu,
        ...stock,
        ...invoicesAll,
        'Pos',
        'Coupon',
        'Offer',
        'Loyalty',
        'ETable',
        'TableSession',
        ...allHr,
      ]),
      ...readFor(['Dashboard', ...ALL_REPORT_SUBJECTS]),
    ],
    [ACCOUNTANT_ROLE_NAME]: [
      ...crudFor(['Invoice', 'CreditNote', 'DebitNote', 'EmployeePayment', 'SalarySlip', 'PayslipCategory']),
      ...readFor([
        'Dashboard',
        'MenuItem',
        'MenuCategory',
        'StockItem',
        'Employee',
        ...ALL_REPORT_SUBJECTS,
      ]),
    ],
    [HR_ROLE_NAME]: [...crudFor(allHr), ...readFor(['Dashboard', ...HR_REPORT_SUBJECTS])],
    [CASHIER_ROLE_NAME]: [
      ...crudFor(['Pos']),
      ...crudFor(['TableSession']),
      { action: 'create', subject: 'Invoice' },
      { action: 'read', subject: 'Invoice' },
      { action: 'update', subject: 'Invoice' },
      { action: 'delete', subject: 'Invoice' },
      { action: 'read', subject: 'CreditNote' },
      { action: 'create', subject: 'CreditNote' },
      { action: 'update', subject: 'CreditNote' },
      { action: 'delete', subject: 'CreditNote' },
      { action: 'read', subject: 'DebitNote' },
      { action: 'create', subject: 'DebitNote' },
      { action: 'update', subject: 'DebitNote' },
      { action: 'delete', subject: 'DebitNote' },
      ...readFor(['MenuItem', 'MenuCategory']),
    ],
    [STAFF_ROLE_NAME]: [],
    [KITCHEN_BOARD_MANAGER_ROLE_NAME]: [
      { action: 'read', subject: 'KitchenBoard' },
      { action: 'update', subject: 'KitchenBoard' },
    ],
  }
}

export const PREDEFINED_ROLE_NAMES = [
  ADMIN_ROLE_NAME,
  MANAGER_ROLE_NAME,
  ACCOUNTANT_ROLE_NAME,
  HR_ROLE_NAME,
  CASHIER_ROLE_NAME,
  STAFF_ROLE_NAME,
  KITCHEN_BOARD_MANAGER_ROLE_NAME,
]

/**
 * Deterministic role id for a restaurant + role name.
 * @param {string} businessProfileId
 * @param {string} roleName
 */
export function predefinedRoleId(businessProfileId, roleName) {
  const slug = roleName.toLowerCase().replace(/[^a-z0-9]+/g, '_')
  return `${slug}_${businessProfileId}`
}

/**
 * Keep existing Kitchen/Staff row id when renaming to Staff.
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof prisma} tx
 * @param {string} businessProfileId
 * @param {string} roleName
 */
export async function resolvePredefinedRoleId(tx, businessProfileId, roleName) {
  if (roleName === STAFF_ROLE_NAME) {
    const existing = await tx.role.findFirst({
      where: {
        businessProfileId,
        name: { in: [STAFF_ROLE_NAME, LEGACY_KITCHEN_STAFF_ROLE_NAME] },
      },
      select: { id: true },
    })
    if (existing) return existing.id
  }
  return predefinedRoleId(businessProfileId, roleName)
}

/**
 * Seed all predefined roles (+ permissions) for a restaurant.
 * Sets ownerUserId caller responsibility on BusinessProfile create.
 * Assigns Admin role to the owner user via BusinessMembership + EmployeeRole.
 *
 * @param {string} businessProfileId
 * @param {string} ownerUserId
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof prisma} [tx]
 */
export async function seedPredefinedRolesForRestaurant(
  businessProfileId,
  ownerUserId,
  tx = prisma,
) {
  const permissionMap = predefinedRolePermissionMap()

  for (const roleName of PREDEFINED_ROLE_NAMES) {
    const roleId = await resolvePredefinedRoleId(tx, businessProfileId, roleName)
    await tx.role.upsert({
      where: { id: roleId },
      create: {
        id: roleId,
        businessProfileId,
        name: roleName,
        isSystem: true,
      },
      update: {
        name: roleName,
        isSystem: true,
      },
    })

    const permissions = permissionMap[roleName] ?? []
    await tx.rolePermission.deleteMany({ where: { roleId } })
    if (permissions.length > 0) {
      await tx.rolePermission.createMany({
        data: permissions.map((p) => ({
          roleId,
          action: p.action,
          subject: p.subject,
        })),
        skipDuplicates: true,
      })
    }
  }

  const adminRoleId = predefinedRoleId(businessProfileId, ADMIN_ROLE_NAME)
  const membership = await tx.businessMembership.upsert({
    where: {
      userId_businessProfileId: {
        userId: ownerUserId,
        businessProfileId,
      },
    },
    create: {
      id: `bm_${businessProfileId}`,
      userId: ownerUserId,
      businessProfileId,
    },
    update: {},
  })

  await tx.employeeRole.upsert({
    where: {
      businessMembershipId_roleId: {
        businessMembershipId: membership.id,
        roleId: adminRoleId,
      },
    },
    create: {
      businessMembershipId: membership.id,
      roleId: adminRoleId,
    },
    update: {},
  })

  await ensureSystemAdvancePayslipCategory(businessProfileId, tx)
  await deleteLegacyQueueDisplayRoles(tx)

  return { membershipId: membership.id, adminRoleId }
}

/**
 * Customer queue is public — drop leftover Queue display roles.
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof prisma} tx
 */
export async function deleteLegacyQueueDisplayRoles(tx = prisma) {
  const roles = await tx.role.findMany({
    where: { name: QUEUE_DISPLAY_ROLE_NAME },
    select: { id: true },
  })
  const ids = roles.map((r) => r.id)
  if (ids.length === 0) return
  await tx.employeeRole.deleteMany({ where: { roleId: { in: ids } } })
  await tx.userInvitation.deleteMany({ where: { roleId: { in: ids } } })
  await tx.rolePermission.deleteMany({ where: { roleId: { in: ids } } })
  await tx.role.deleteMany({ where: { id: { in: ids } } })
}

/**
 * Ensure all predefined roles exist for a restaurant. Safe to call repeatedly.
 *
 * @param {string} businessProfileId
 * @param {import('@/generated/prisma/client').Prisma.TransactionClient | typeof prisma} [tx]
 */
export async function ensurePredefinedRolesExist(businessProfileId, tx = prisma) {
  // Delete + recreate must be atomic so a concurrent ability read never sees a
  // role with no permissions (transient 403s).
  if (tx === prisma) {
    return prisma.$transaction(
      (inner) => ensurePredefinedRolesExist(businessProfileId, inner),
      PRISMA_INTERACTIVE_TRANSACTION_OPTIONS,
    )
  }
  const permissionMap = predefinedRolePermissionMap()
  for (const roleName of PREDEFINED_ROLE_NAMES) {
    const roleId = await resolvePredefinedRoleId(tx, businessProfileId, roleName)
    await tx.role.upsert({
      where: { id: roleId },
      create: {
        id: roleId,
        businessProfileId,
        name: roleName,
        isSystem: true,
      },
      update: {
        name: roleName,
        isSystem: true,
      },
    })

    // Always resync from the seed map so permission matrix changes apply to
    // existing restaurants (Admin stays empty — synthetic manage/all).
    const permissions = permissionMap[roleName] ?? []
    await tx.rolePermission.deleteMany({ where: { roleId } })
    if (permissions.length > 0) {
      await tx.rolePermission.createMany({
        data: permissions.map((p) => ({
          roleId,
          action: p.action,
          subject: p.subject,
        })),
        skipDuplicates: true,
      })
    }
  }
  await deleteLegacyQueueDisplayRoles(tx)
}

/** @type {Map<string, Promise<void>>} */
const rolesSyncedThisProcess = new Map()

/**
 * Hot-path variant of {@link ensurePredefinedRolesExist}: resyncs each
 * restaurant's predefined roles once per server process. The seed map only
 * changes with a deploy (which restarts the process), so matrix changes still
 * reach existing restaurants without rewriting RolePermission rows on every
 * authorized request. Concurrent callers share the in-flight sync.
 *
 * @param {string} businessProfileId
 */
export function ensurePredefinedRolesSynced(businessProfileId) {
  let pending = rolesSyncedThisProcess.get(businessProfileId)
  if (!pending) {
    pending = ensurePredefinedRolesExist(businessProfileId).catch((err) => {
      rolesSyncedThisProcess.delete(businessProfileId)
      throw err
    })
    rolesSyncedThisProcess.set(businessProfileId, pending)
  }
  return pending
}

/**
 * True when the assigned role names produce an empty permission union
 * (no login account should be created).
 *
 * @param {string[]} roleNames
 */
export function rolesRequireNoLogin(roleNames) {
  if (!roleNames || roleNames.length === 0) return true
  const permissionMap = predefinedRolePermissionMap()
  const union = new Set()
  for (const name of roleNames) {
    if (name === ADMIN_ROLE_NAME) return false
    if (name === LEGACY_KITCHEN_STAFF_ROLE_NAME) continue
    for (const p of permissionMap[name] ?? []) {
      union.add(`${p.action}:${p.subject}`)
    }
  }
  return union.size === 0
}
