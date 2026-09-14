import { jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { prisma } from '@/lib/prisma'

/** @param {import('next/server').NextRequest} request */
export async function GET(request) {
  try {
    const auth = await authorizeBusinessRequest(request)
    if (auth.error) return auth.error
    const { profile } = auth
    const id = profile.id

    const [
      menuItems,
      menuCategories,
      invoices,
      creditNotes,
      debitNotes,
      employees,
      salarySlips,
    ] = await Promise.all([
      prisma.menuItem.count({ where: { businessProfileId: id } }),
      prisma.menuCategory.count({ where: { businessProfileId: id } }),
      prisma.invoice.count({
        where: { businessProfileId: id, ...WHERE_NOT_DELETED },
      }),
      prisma.creditNote.count({
        where: { businessProfileId: id, ...WHERE_NOT_DELETED },
      }),
      prisma.debitNote.count({
        where: { businessProfileId: id, ...WHERE_NOT_DELETED },
      }),
      prisma.employee.count({
        where: { businessProfileId: id, ...WHERE_NOT_DELETED },
      }),
      prisma.salarySlip.count({
        where: { businessProfileId: id, ...WHERE_NOT_DELETED },
      }),
    ])

    return jsonOk({
      counts: {
        menuItems,
        menuCategories,
        invoices,
        creditNotes,
        debitNotes,
        employees,
        salarySlips,
      },
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/settings/data-summary')
  }
}
