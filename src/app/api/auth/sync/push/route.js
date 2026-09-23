import { jsonError, jsonOk } from '@/lib/api/json-response'
import { handleRouteError } from '@/lib/api/route-error'
import { authorizeBusinessRequest } from '@/lib/rbac/authorize-api-request'
import { applySyncPushBatch } from '@/lib/sync/apply-sync-push-batch'
import { syncPushBodySchema } from '@/lib/sync/sync-push-body-schema'
import { processZatcaQueueForBusiness } from '@/lib/zatca/run-zatca-background-report'

/**
 * POST /api/auth/sync/push
 * Desktop outbox batch — idempotent by eventId per restaurant.
 * After new invoices land, kick background ZATCA reporting (Step 9).
 */
export async function POST(request) {
  try {
    const auth = await authorizeBusinessRequest({
      request,
      skipPermissionCheck: true,
    })
    if (auth.error) return auth.error

    let body
    try {
      body = await request.json()
    } catch {
      return jsonError(400, 'INVALID_JSON', 'Invalid JSON')
    }

    const parsed = syncPushBodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.issues)
    }

    const result = await applySyncPushBatch({
      businessProfileId: auth.profile.id,
      posTillId: parsed.data.tillId,
      events: parsed.data.events,
      pendingUploadCount: parsed.data.pendingUploadCount,
    })

    if (!result.ok) {
      return jsonError(
        409,
        result.error?.code || 'PUSH_APPLY_FAILED',
        result.error?.message || 'Could not apply outbox batch',
        { results: result.results },
      )
    }

    const pushedInvoice = parsed.data.events.some(
      (e) => String(e?.eventType || '') === 'invoice.created',
    )
    if (pushedInvoice) {
      void processZatcaQueueForBusiness(auth.profile.id).catch((err) => {
        console.error('[sync/push] zatca background kick failed', err)
      })
    }

    return jsonOk({
      accepted: result.accepted,
      results: result.results,
    })
  } catch (err) {
    return handleRouteError(err, 'POST /api/auth/sync/push')
  }
}
