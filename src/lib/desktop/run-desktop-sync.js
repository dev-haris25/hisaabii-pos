import { authGet, authPost } from '@/lib/api/auth-client'
import { getHisabiDesktop } from '@/lib/desktop/hisabi-desktop'

/**
 * @param {(progress: { percent: number, phase: string, mode: string }) => void} [onProgress]
 * @returns {Promise<{ offlineReady: boolean, businessProfileId: string | null }>}
 */
export async function runDesktopFullSync(onProgress) {
  const desktop = getHisabiDesktop()
  if (!desktop?.applyPullBatch || !desktop.finalizeFullSync) {
    throw new Error('DESKTOP_SYNC_UNAVAILABLE')
  }

  let cursor = /** @type {string | null} */ (null)
  let businessProfileId = /** @type {string | null} */ (null)
  let wipeRestaurant = true
  let guard = 0

  while (guard < 500) {
    guard += 1
    const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
    const page = await authGet(`/sync/pull${qs}`)
    businessProfileId = page.businessProfileId || businessProfileId

    if (typeof onProgress === 'function' && page.progress) {
      onProgress({
        percent: Number(page.progress.percent) || 0,
        phase: String(page.progress.phase || ''),
        mode: String(page.mode || 'full'),
      })
    }

    await desktop.applyPullBatch({
      businessProfileId: page.businessProfileId,
      entities: page.entities || {},
      wipeRestaurant,
    })
    wipeRestaurant = false

    cursor = typeof page.nextCursor === 'string' ? page.nextCursor : null

    if (page.done) {
      try {
        const secretsRes = await authGet('/sync/zatca-secrets')
        if (secretsRes?.hasDevice && secretsRes.secrets) {
          await desktop.storeZatcaSecrets({
            businessProfileId: secretsRes.businessProfileId,
            secrets: secretsRes.secrets,
          })
        }
      } catch {
        /* secrets optional if not onboarded */
      }

      await desktop.finalizeFullSync({
        businessProfileId: page.businessProfileId,
        pullCursor: cursor,
      })
      return {
        offlineReady: true,
        businessProfileId: page.businessProfileId,
      }
    }

    if (!cursor) {
      throw new Error('SYNC_CURSOR_MISSING')
    }
  }

  throw new Error('SYNC_TOO_MANY_PAGES')
}

/**
 * Push pending outbox events to cloud (idempotent).
 * @returns {Promise<{ pushed: number, pendingUploadCount: number }>}
 */
export async function runDesktopOutboxPush() {
  const desktop = getHisabiDesktop()
  if (!desktop?.buildPushBatch || !desktop.markOutboxSynced) {
    return { pushed: 0, pendingUploadCount: 0 }
  }

  let pushed = 0
  let guard = 0
  let pendingUploadCount = 0

  while (guard < 50) {
    guard += 1
    const batch = await desktop.buildPushBatch({ limit: 40 })
    pendingUploadCount = Number(batch?.pendingUploadCount) || 0
    const events = Array.isArray(batch?.events) ? batch.events : []
    if (events.length === 0) break

    const tillId = await desktop.getTillId?.()
    const bodyEvents = events.map((e) => ({
      eventId: e.eventId,
      eventType: e.eventType,
      payload: e.payload,
      invoice: e.invoice,
      lines: e.lines,
      kitchenOrder: e.kitchenOrder,
      movement: e.movement,
      tip: e.tip,
    }))

    try {
      const remainingAfter = Math.max(0, pendingUploadCount - events.length)
      const res = await authPost('/sync/push', {
        tillId: tillId || null,
        pendingUploadCount: remainingAfter,
        events: bodyEvents,
      })

      const results = Array.isArray(res?.results) ? res.results : []
      const okIds = new Set(
        results.filter((r) => r && r.ok).map((r) => String(r.eventId)),
      )
      const syncedOutboxIds = events
        .filter((e) => okIds.has(String(e.eventId)))
        .map((e) => e.outboxId)
        .filter((id) => id != null)

      if (syncedOutboxIds.length > 0) {
        const marked = await desktop.markOutboxSynced({
          outboxIds: syncedOutboxIds,
        })
        pendingUploadCount = Number(marked?.pendingUploadCount) || 0
        pushed += syncedOutboxIds.length
      }

      const failed = results.find((r) => r && !r.ok)
      if (failed) {
        const failOutbox = events.find(
          (e) => String(e.eventId) === String(failed.eventId),
        )
        if (failOutbox?.outboxId != null && desktop.markOutboxAttempt) {
          await desktop.markOutboxAttempt({
            failures: [
              {
                id: failOutbox.outboxId,
                error: failed.message || failed.code || 'PUSH_FAILED',
              },
            ],
          })
        }
        break
      }

      if (syncedOutboxIds.length === 0) break
    } catch (err) {
      // Partial success may be in AuthApiError.details.results (409)
      const details =
        err && typeof err === 'object' && 'details' in err
          ? /** @type {{ results?: Array<{ eventId?: string, ok?: boolean, message?: string, code?: string }> }} */ (
              err.details
            )
          : null
      if (details && Array.isArray(details.results)) {
        const okIds = new Set(
          details.results
            .filter((r) => r && r.ok)
            .map((r) => String(r.eventId)),
        )
        const syncedOutboxIds = events
          .filter((e) => okIds.has(String(e.eventId)))
          .map((e) => e.outboxId)
          .filter((id) => id != null)
        if (syncedOutboxIds.length > 0) {
          await desktop.markOutboxSynced({ outboxIds: syncedOutboxIds })
          pushed += syncedOutboxIds.length
        }
        const failed = details.results.find((r) => r && !r.ok)
        if (failed && desktop.markOutboxAttempt) {
          const failOutbox = events.find(
            (e) => String(e.eventId) === String(failed.eventId),
          )
          if (failOutbox?.outboxId != null) {
            await desktop.markOutboxAttempt({
              failures: [
                {
                  id: failOutbox.outboxId,
                  error: failed.message || failed.code || 'PUSH_FAILED',
                },
              ],
            })
          }
        }
        break
      }
      if (desktop.markOutboxAttempt) {
        await desktop.markOutboxAttempt({
          failures: events.map((e) => ({
            id: e.outboxId,
            error: err instanceof Error ? err.message : 'PUSH_FAILED',
          })),
        })
      }
      throw err
    }
  }

  return { pushed, pendingUploadCount }
}

/**
 * Push outbox then incremental pull when already offlineReady and online.
 * @param {(progress: { percent: number, phase: string, mode: string }) => void} [onProgress]
 */
export async function runDesktopIncrementalSync(onProgress) {
  const desktop = getHisabiDesktop()
  if (!desktop?.applyPullBatch || !desktop.finalizeIncrementalSync) {
    throw new Error('DESKTOP_SYNC_UNAVAILABLE')
  }

  if (typeof onProgress === 'function') {
    onProgress({ percent: 5, phase: 'push', mode: 'incremental' })
  }
  try {
    await runDesktopOutboxPush()
  } catch {
    /* push errors surface on next attempt; still pull remote changes */
  }

  const status = desktop.getLocalStatus ? await desktop.getLocalStatus() : null
  const cursor =
    typeof status?.pullCursor === 'string' && status.pullCursor
      ? status.pullCursor
      : null

  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
  const page = await authGet(`/sync/pull${qs}`)

  if (typeof onProgress === 'function' && page.progress) {
    onProgress({
      percent: Number(page.progress.percent) || 100,
      phase: String(page.progress.phase || 'incremental'),
      mode: String(page.mode || 'incremental'),
    })
  }

  await desktop.applyPullBatch({
    businessProfileId: page.businessProfileId,
    entities: page.entities || {},
    wipeRestaurant: false,
  })

  try {
    const secretsRes = await authGet('/sync/zatca-secrets')
    if (secretsRes?.hasDevice && secretsRes.secrets) {
      await desktop.storeZatcaSecrets({
        businessProfileId: secretsRes.businessProfileId,
        secrets: secretsRes.secrets,
      })
    }
  } catch {
    /* optional */
  }

  await desktop.finalizeIncrementalSync({
    pullCursor: page.nextCursor ?? cursor,
  })

  return {
    offlineReady: true,
    businessProfileId: page.businessProfileId,
  }
}
