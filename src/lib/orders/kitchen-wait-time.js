/** @param {string | Date} createdAt */
export function kitchenWaitMs(createdAt, now = Date.now()) {
  const start = new Date(createdAt).getTime()
  if (!Number.isFinite(start)) return 0
  return Math.max(0, now - start)
}

/**
 * Live card wait — under a minute reads as "just now".
 * @param {number} ms
 * @param {(key: string, values?: Record<string, string | number>) => string} t
 */
export function formatKitchenWait(ms, t) {
  const totalMin = Math.floor(ms / 60000)
  if (totalMin < 1) return t('waitJustNow')
  return formatKitchenAverage(ms, t)
}

/**
 * Stats duration — always minutes (or hours). Empty / under a minute is 0m.
 * @param {number} ms
 * @param {(key: string, values?: Record<string, string | number>) => string} t
 */
export function formatKitchenAverage(ms, t) {
  const totalMin = Math.max(0, Math.floor(Number(ms) / 60000) || 0)
  if (totalMin < 60) return t('waitMinutesLong', { count: totalMin })
  const hours = Math.floor(totalMin / 60)
  const mins = totalMin % 60
  if (mins === 0) return t('waitHours', { count: hours })
  return t('waitHoursMinutes', { hours, minutes: mins })
}

/** @param {number} ms */
export function kitchenAgeTone(ms) {
  const min = ms / 60000
  if (min >= 15) return 'late'
  if (min >= 5) return 'warn'
  return 'fresh'
}
