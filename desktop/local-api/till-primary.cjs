/**
 * Resolve whether a bound till is the restaurant primary (local SQLite).
 * @param {string | null | undefined} tillId
 * @returns {{
 *   tillId: string | null
 *   isPrimary: boolean
 *   primaryPosTillId: string | null
 *   offlineReady: boolean
 * }}
 */
function getLocalTillPrimaryStatus(tillId) {
  const { getLocalDb, getLocalStatus } = require('../db/open-db.cjs')
  const status = getLocalStatus()
  const id =
    typeof tillId === 'string' && tillId.trim() ? tillId.trim() : null

  let primaryPosTillId = null
  if (status.businessProfileId) {
    const profile = getLocalDb()
      .prepare(
        `SELECT primary_pos_till_id FROM business_profiles WHERE id = ?`,
      )
      .get(status.businessProfileId)
    primaryPosTillId = profile?.primary_pos_till_id ?? null
  }

  let isPrimary = false
  if (id) {
    const till = getLocalDb()
      .prepare(`SELECT id, is_primary FROM pos_tills WHERE id = ?`)
      .get(id)
    if (till) {
      isPrimary =
        Boolean(till.is_primary) ||
        (primaryPosTillId != null && primaryPosTillId === id)
    } else if (primaryPosTillId != null && primaryPosTillId === id) {
      isPrimary = true
    }
  }

  return {
    tillId: id,
    isPrimary,
    primaryPosTillId,
    offlineReady: status.offlineReady,
  }
}

/**
 * Reject offline checkout when this till is not primary, or when
 * an admin has not unlocked offline mode for this outage.
 *
 * @param {{ tillId?: string | null }} [input]
 * @returns {{ ok: true, tillId: string, primaryPosTillId: string | null } | { ok: false, status: number, code: string, message: string }}
 */
function assertLocalOfflineCheckoutAllowed(input = {}) {
  const tillId =
    typeof input.tillId === 'string' && input.tillId.trim()
      ? input.tillId.trim()
      : null

  if (!tillId) {
    return {
      ok: false,
      status: 403,
      code: 'PRIMARY_TILL_REQUIRED',
      message: 'Offline sales require the primary till',
    }
  }

  const info = getLocalTillPrimaryStatus(tillId)
  if (!info.isPrimary) {
    return {
      ok: false,
      status: 403,
      code: 'PRIMARY_TILL_REQUIRED',
      message: 'Only the primary till can take sales while offline',
    }
  }

  const {
    isOfflineCheckoutUnlocked,
  } = require('./offline-unlock.cjs')
  if (!isOfflineCheckoutUnlocked()) {
    return {
      ok: false,
      status: 403,
      code: 'OFFLINE_MODE_LOCKED',
      message:
        'Ask an admin to log in and enable offline mode for this till',
    }
  }

  return {
    ok: true,
    tillId,
    primaryPosTillId: info.primaryPosTillId,
  }
}

module.exports = {
  getLocalTillPrimaryStatus,
  assertLocalOfflineCheckoutAllowed,
}
