import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { WHERE_NOT_DELETED } from '@/lib/db/soft-delete-scope'
import { computeLoyaltyAccountStats } from '@/lib/loyalty/compute-loyalty-account-stats'
import { loadOwnedLoyaltyAccount } from '@/lib/loyalty/load-owned-loyalty-account'
import {
  adjustLoyaltyAccountBalance,
  softDeleteLoyaltyAccount,
} from '@/lib/loyalty/loyalty-account-access'
import { loyaltyCustomerPatchSchema, isValidLoyaltyBalanceString } from '@/lib/loyalty/loyalty-customer-schemas'
import { mapLoyaltyAccountToJson } from '@/lib/loyalty/map-loyalty-account-json'
import { normalizeLoyaltyPhone } from '@/lib/loyalty/normalize-loyalty-phone'
import { prisma } from '@/lib/prisma'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'

/** @param {import('next/server').NextRequest} request */
export async function GET(request, context) {
  try {
    const auth = await authorizeBusinessRequest(request, {
      action: 'read',
      subject: 'Loyalty',
    })
    if (auth.error) return auth.error
    const { id } = await context.params

    const account = await loadOwnedLoyaltyAccount(auth.profile.id, id)
    if (!account) {
      return jsonError(
        404,
        'LOYALTY_ACCOUNT_NOT_FOUND',
        'Loyalty account not found',
      )
    }

    const [invoices, transactions] = await Promise.all([
      prisma.invoice.findMany({
        where: { loyaltyAccountId: id, businessProfileId: auth.profile.id },
        select: { grandTotal: true },
      }),
      prisma.loyaltyTransaction.findMany({
        where: { accountId: id },
        select: { type: true, points: true },
      }),
    ])

    const stats = computeLoyaltyAccountStats({ invoices, transactions })

    return jsonOk({
      customer: mapLoyaltyAccountToJson(account),
      stats,
    })
  } catch (err) {
    return handleRouteError(err, 'GET /api/auth/loyalty/customers/[id]')
  }
}

/** @param {import('next/server').NextRequest} request */
export async function PATCH(request, context) {
  try {
    const auth = await authorizeBusinessRequest(request, {
      action: 'update',
      subject: 'Loyalty',
    })
    if (auth.error) return auth.error
    const { profile } = auth
    const { id } = await context.params

    const existing = await loadOwnedLoyaltyAccount(profile.id, id)
    if (!existing) {
      return jsonError(
        404,
        'LOYALTY_ACCOUNT_NOT_FOUND',
        'Loyalty account not found',
      )
    }

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = loyaltyCustomerPatchSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const d = parsed.data
    if (d.phone === undefined && d.balance === undefined) {
      return jsonError(400, 'VALIDATION_ERROR', 'Provide at least one field')
    }

    if (d.balance !== undefined) {
      if (!isValidLoyaltyBalanceString(d.balance)) {
        return jsonError(
          400,
          'LOYALTY_ACCOUNT_BALANCE_INVALID',
          'Balance must be a non-negative amount (up to 4 decimal places)',
        )
      }
    }

    /** @type {string | undefined} */
    let nextPhone
    if (d.phone !== undefined) {
      const normalized = normalizeLoyaltyPhone(d.phone)
      if (!normalized.valid) {
        return jsonError(
          400,
          'LOYALTY_ACCOUNT_PHONE_INVALID',
          normalized.error,
        )
      }
      nextPhone = normalized.normalized

      if (nextPhone !== existing.phone) {
        const collision = await prisma.loyaltyAccount.findFirst({
          where: {
            businessProfileId: profile.id,
            phone: nextPhone,
            ...WHERE_NOT_DELETED,
            NOT: { id },
          },
          select: { id: true },
        })
        if (collision) {
          return jsonError(
            400,
            'LOYALTY_ACCOUNT_PHONE_ALREADY_EXISTS',
            'Another loyalty account already uses this phone number',
          )
        }
      }
    }

    let account = existing

    if (nextPhone !== undefined && nextPhone !== existing.phone) {
      account = await prisma.loyaltyAccount.update({
        where: { id },
        data: { phone: nextPhone },
      })
    }

    if (d.balance !== undefined) {
      const adjusted = await adjustLoyaltyAccountBalance(
        id,
        String(d.balance).trim(),
        'absolute',
      )
      if ('error' in adjusted) {
        return jsonError(
          404,
          'LOYALTY_ACCOUNT_NOT_FOUND',
          adjusted.message,
        )
      }
      account = adjusted.account
    }

    return jsonOk({
      customer: mapLoyaltyAccountToJson(account),
    })
  } catch (err) {
    return handleRouteError(err, 'PATCH /api/auth/loyalty/customers/[id]')
  }
}

/** @param {import('next/server').NextRequest} request */
export async function DELETE(request, context) {
  try {
    const auth = await authorizeBusinessRequest(request, {
      action: 'delete',
      subject: 'Loyalty',
    })
    if (auth.error) return auth.error
    const { id } = await context.params

    const existing = await loadOwnedLoyaltyAccount(auth.profile.id, id)
    if (!existing) {
      return jsonError(
        404,
        'LOYALTY_ACCOUNT_NOT_FOUND',
        'Loyalty account not found',
      )
    }

    const result = await softDeleteLoyaltyAccount(id)
    if ('error' in result) {
      if (result.error === 'ACCOUNT_ALREADY_DELETED') {
        return jsonError(
          400,
          'LOYALTY_ACCOUNT_ALREADY_DELETED',
          result.message,
        )
      }
      return jsonError(404, 'LOYALTY_ACCOUNT_NOT_FOUND', result.message)
    }

    return jsonOk({
      customer: mapLoyaltyAccountToJson(result.account),
    })
  } catch (err) {
    return handleRouteError(err, 'DELETE /api/auth/loyalty/customers/[id]')
  }
}
