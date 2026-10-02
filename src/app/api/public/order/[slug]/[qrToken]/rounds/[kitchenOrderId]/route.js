import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '@/lib/db/prisma-interactive-transaction-options'
import {
  cancelEWaiterRoundInDb,
  replaceEWaiterRoundLines,
} from '@/lib/e-waiter/replace-e-waiter-round-lines'
import {
  eWaiterOrderLinesSchema,
  loadPublicTableRound,
  mapPublicRoundJson,
  resolveEWaiterOrderLines,
} from '@/lib/e-waiter/resolve-e-waiter-order-lines'
import { resolvePublicOrderTable } from '@/lib/e-waiter/resolve-public-order-table'
import { notifyGuestEWaiterRoundCancelled } from '@/lib/notifications/notify-guest-e-waiter-round-cancelled'
import { prisma } from '@/lib/prisma'

const patchBodySchema = z.object({
  lines: eWaiterOrderLinesSchema,
})

/**
 * @param {import('next/server').NextRequest} _request
 * @param {{ params: Promise<{ slug: string, qrToken: string, kitchenOrderId: string }> }} context
 */
export async function GET(_request, context) {
  try {
    const { slug, qrToken, kitchenOrderId } = await context.params
    const resolved = await resolvePublicOrderTable(slug, qrToken)
    if (!resolved) {
      return jsonError(404, 'NOT_FOUND', 'Order page not found')
    }

    const row = await loadPublicTableRound(
      resolved.profile,
      resolved.table,
      kitchenOrderId,
    )
    if (!row) {
      return jsonError(404, 'NOT_FOUND', 'Round not found')
    }

    return jsonOk({
      round: mapPublicRoundJson(row, resolved.profile.slug),
    })
  } catch (err) {
    return handleRouteError(
      err,
      'GET /api/public/order/[slug]/[qrToken]/rounds/[kitchenOrderId]',
    )
  }
}

/**
 * Replace items on a pending E-Waiter round.
 * Empty lines → auto-cancel. Status re-checked inside the transaction.
 */
export async function PATCH(request, context) {
  try {
    const { slug, qrToken, kitchenOrderId } = await context.params
    const resolved = await resolvePublicOrderTable(slug, qrToken)
    if (!resolved) {
      return jsonError(404, 'NOT_FOUND', 'Order page not found')
    }

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = patchBodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const existing = await loadPublicTableRound(
      resolved.profile,
      resolved.table,
      kitchenOrderId,
    )
    if (!existing) {
      return jsonError(404, 'NOT_FOUND', 'Round not found')
    }
    if (existing.status !== 'pending') {
      return jsonError(
        409,
        'ROUND_NOT_EDITABLE',
        'This order is already being prepared',
      )
    }

    const resolvedLines = await resolveEWaiterOrderLines(
      resolved.profile.id,
      parsed.data.lines,
    )
    if (!resolvedLines.ok) {
      return jsonError(
        resolvedLines.status,
        resolvedLines.code,
        resolvedLines.message,
      )
    }

    if (!existing.tableSessionId) {
      return jsonError(409, 'ROUND_NOT_EDITABLE', 'This order cannot be edited')
    }

    const result = await replaceEWaiterRoundLines({
      kitchenOrderId: existing.id,
      tableSessionId: existing.tableSessionId,
      resolvedLines: resolvedLines.lines,
    })

    if (!result.ok) {
      return jsonError(result.status, result.code, result.message)
    }

    if (result.cancelled) {
      void notifyGuestEWaiterRoundCancelled({
        businessProfileId: resolved.profile.id,
        kitchenOrderId: String(result.kitchenOrderId),
        orderNumber: result.orderNumber,
        roundNumber: result.roundNumber,
        tableName: resolved.table.name,
      })
      return jsonOk({
        cancelled: true,
        sessionClosed: result.sessionClosed === true,
        kitchenOrderId: result.kitchenOrderId,
        status: result.status,
        orderNumber: result.orderNumber,
        roundNumber: result.roundNumber,
      })
    }

    const refreshed = await loadPublicTableRound(
      resolved.profile,
      resolved.table,
      existing.id,
    )
    return jsonOk({
      cancelled: false,
      round: refreshed
        ? mapPublicRoundJson(refreshed, resolved.profile.slug)
        : null,
    })
  } catch (err) {
    return handleRouteError(
      err,
      'PATCH /api/public/order/[slug]/[qrToken]/rounds/[kitchenOrderId]',
    )
  }
}

/**
 * Cancel the entire pending round.
 */
export async function DELETE(_request, context) {
  try {
    const { slug, qrToken, kitchenOrderId } = await context.params
    const resolved = await resolvePublicOrderTable(slug, qrToken)
    if (!resolved) {
      return jsonError(404, 'NOT_FOUND', 'Order page not found')
    }

    const existing = await loadPublicTableRound(
      resolved.profile,
      resolved.table,
      kitchenOrderId,
    )
    if (!existing) {
      return jsonError(404, 'NOT_FOUND', 'Round not found')
    }

    const result = await prisma.$transaction(async (tx) => {
      const locked = await tx.kitchenOrder.findFirst({
        where: { id: existing.id },
        select: { id: true, status: true },
      })
      if (!locked) {
        return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Round not found' }
      }
      if (locked.status !== 'pending') {
        return {
          ok: false,
          status: 409,
          code: 'ROUND_NOT_EDITABLE',
          message: 'This order is already being prepared',
        }
      }
      const cancelled = await cancelEWaiterRoundInDb(tx, locked.id)
      return { ok: true, cancelled }
    }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS)

    if (!result.ok) {
      return jsonError(result.status, result.code, result.message)
    }

    void notifyGuestEWaiterRoundCancelled({
      businessProfileId: resolved.profile.id,
      kitchenOrderId: result.cancelled.id,
      orderNumber: result.cancelled.orderNumber,
      roundNumber: result.cancelled.roundNumber,
      tableName: resolved.table.name,
    })

    return jsonOk({
      cancelled: true,
      sessionClosed: result.cancelled.sessionClosed === true,
      kitchenOrderId: result.cancelled.id,
      status: result.cancelled.status,
      orderNumber: result.cancelled.orderNumber,
      roundNumber: result.cancelled.roundNumber,
    })
  } catch (err) {
    return handleRouteError(
      err,
      'DELETE /api/public/order/[slug]/[qrToken]/rounds/[kitchenOrderId]',
    )
  }
}
