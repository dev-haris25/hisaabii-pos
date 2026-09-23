/** Heartbeat is fresh if received within this window (ms). */
export const TILL_HEARTBEAT_FRESH_MS = 45_000

/**
 * @param {Date | string | null | undefined} lastHeartbeatAt
 * @param {number} [nowMs]
 */
export function isTillHeartbeatFresh(lastHeartbeatAt, nowMs = Date.now()) {
  if (!lastHeartbeatAt) return false
  const t =
    lastHeartbeatAt instanceof Date
      ? lastHeartbeatAt.getTime()
      : Date.parse(String(lastHeartbeatAt))
  if (!Number.isFinite(t)) return false
  return nowMs - t < TILL_HEARTBEAT_FRESH_MS
}
