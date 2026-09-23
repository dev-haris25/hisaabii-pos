const { getLocalDb, getLocalStatus } = require('../db/open-db.cjs')

/**
 * @returns {boolean}
 */
function isOfflineCheckoutUnlocked() {
  try {
    const row = getLocalDb()
      .prepare(
        `SELECT offline_checkout_unlocked FROM sync_state WHERE id = 1`,
      )
      .get()
    return Boolean(row?.offline_checkout_unlocked)
  } catch {
    return false
  }
}

/**
 * Admin/owner unlock for this outage (local only).
 * @returns {{ ok: true, unlocked: true } | { ok: false, code: string, message: string, status: number }}
 */
function unlockOfflineCheckout() {
  const status = getLocalStatus()
  if (!status.offlineReady) {
    return {
      ok: false,
      status: 403,
      code: 'OFFLINE_NOT_READY',
      message: 'Finish first sync while online before enabling offline mode',
    }
  }
  getLocalDb()
    .prepare(
      `UPDATE sync_state SET offline_checkout_unlocked = 1, updated_at = datetime('now') WHERE id = 1`,
    )
    .run()
  return { ok: true, unlocked: true }
}

/**
 * Clear unlock after reconnect + sync (or when online again).
 * @returns {{ ok: true, unlocked: false }}
 */
function clearOfflineCheckoutUnlock() {
  try {
    getLocalDb()
      .prepare(
        `UPDATE sync_state SET offline_checkout_unlocked = 0, updated_at = datetime('now') WHERE id = 1`,
      )
      .run()
  } catch {
    /* column may not exist yet on very old DBs mid-migration */
  }
  return { ok: true, unlocked: false }
}

/**
 * @returns {{ unlocked: boolean, offlineReady: boolean }}
 */
function getOfflineCheckoutUnlockStatus() {
  return {
    unlocked: isOfflineCheckoutUnlocked(),
    offlineReady: getLocalStatus().offlineReady === true,
  }
}

module.exports = {
  isOfflineCheckoutUnlocked,
  unlockOfflineCheckout,
  clearOfflineCheckoutUnlock,
  getOfflineCheckoutUnlockStatus,
}
