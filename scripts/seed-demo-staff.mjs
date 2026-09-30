/**
 * Dev seed: Manager + Cashier login users on the demo restaurant.
 * Idempotent. Does not create menu/stock/owner — run db:seed-demo-dev first
 * if the owner restaurant does not exist yet.
 *
 * Credentials (same password as demo owner):
 *   manager@hisaabiipos.com / Demo@123
 *   cashier@hisaabiipos.com / Demo@123
 *
 * Run: bun scripts/seed-demo-staff.mjs
 *   or: bun run db:seed-demo-staff
 */
import { hashPassword } from '../src/lib/auth/password.js'
import {
  CASHIER_ROLE_NAME,
  MANAGER_ROLE_NAME,
} from '../src/lib/rbac/permission-registry.js'
import {
  ensurePredefinedRolesExist,
  predefinedRoleId,
} from '../src/lib/rbac/seed-predefined-roles.js'
import { createPrisma, log } from './seed-demo-dev/db.mjs'

const DEMO_OWNER_EMAIL = 'demo@hisaabiipos.com'
const DEMO_PASSWORD = 'Demo@123'

const STAFF = [
  {
    email: 'manager@hisaabiipos.com',
    name: 'Demo Manager',
    roleName: MANAGER_ROLE_NAME,
  },
  {
    email: 'cashier@hisaabiipos.com',
    name: 'Demo Cashier',
    roleName: CASHIER_ROLE_NAME,
  },
]

async function main() {
  const prisma = createPrisma()
  try {
    const owner = await prisma.user.findUnique({
      where: { email: DEMO_OWNER_EMAIL },
      select: {
        id: true,
        activeBusinessProfileId: true,
        ownedBusinesses: { select: { id: true }, take: 1 },
      },
    })
    if (!owner) {
      throw new Error(
        `Owner ${DEMO_OWNER_EMAIL} not found — run bun run db:seed-demo-dev first`,
      )
    }
    const profileId =
      owner.activeBusinessProfileId ?? owner.ownedBusinesses[0]?.id
    if (!profileId) throw new Error('Owner has no business profile')

    await ensurePredefinedRolesExist(profileId, prisma)

    const passwordHash = hashPassword(DEMO_PASSWORD)

    for (const staff of STAFF) {
      const user = await prisma.user.upsert({
        where: { email: staff.email },
        create: {
          name: staff.name,
          email: staff.email,
          passwordHash,
          emailVerified: true,
          active: true,
          activeBusinessProfileId: profileId,
        },
        update: {
          name: staff.name,
          passwordHash,
          emailVerified: true,
          active: true,
          activeBusinessProfileId: profileId,
        },
      })

      const membership = await prisma.businessMembership.upsert({
        where: {
          userId_businessProfileId: {
            userId: user.id,
            businessProfileId: profileId,
          },
        },
        create: {
          userId: user.id,
          businessProfileId: profileId,
        },
        update: {},
      })

      const roleId = predefinedRoleId(profileId, staff.roleName)
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

      log(`${staff.roleName}: ${staff.email} / ${DEMO_PASSWORD}`)
    }

    log(`Done — staff on profileId=${profileId}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error('[seed-demo-staff] failed:', err)
  process.exit(1)
})
