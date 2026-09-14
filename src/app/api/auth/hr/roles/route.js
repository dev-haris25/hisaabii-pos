import { jsonOk } from '@/lib/api/json-response'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { prisma } from '@/lib/prisma'
import { ADMIN_ROLE_NAME } from '@/lib/rbac/permission-registry'
import {
  PREDEFINED_ROLE_NAMES,
  ensurePredefinedRolesExist,
  rolesRequireNoLogin,
} from '@/lib/rbac/seed-predefined-roles'

/** GET /api/auth/hr/roles — predefined roles for the active restaurant. */
export async function GET(request) {
  const auth = await authorizeBusinessRequest(request)
  if (auth.error) return auth.error
  const { profile } = auth

  await ensurePredefinedRolesExist(profile.id)

  const roles = await prisma.role.findMany({
    where: {
      businessProfileId: profile.id,
      name: { in: PREDEFINED_ROLE_NAMES },
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  return jsonOk({
    items: roles.map((r) => ({
      id: r.id,
      name: r.name,
      isAdmin: r.name === ADMIN_ROLE_NAME,
      requiresNoLogin: rolesRequireNoLogin([r.name]),
    })),
  })
}
