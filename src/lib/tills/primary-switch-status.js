import { prisma } from '@/lib/prisma'
import { isTillHeartbeatFresh } from '@/lib/tills/till-heartbeat'

/**
 * @typedef {{
 *   canSwitch: boolean
 *   reason: null | 'PRIMARY_TILL_OFFLINE' | 'PRIMARY_TILL_SYNCING'
 *   primaryPosTillId: string | null
 *   primaryOnline: boolean
 *   pendingUploadCount: number
 *   lastHeartbeatAt: string | null
 * }} PrimarySwitchStatus
 */

/**
 * Whether the restaurant may change the primary offline till.
 * Safe when there is no primary, or primary heartbeat is fresh and pendingUploadCount === 0.
 *
 * @param {string} businessProfileId
 * @param {string} [targetTillId] — if same as current primary, always allowed
 * @returns {Promise<PrimarySwitchStatus>}
 */
export async function getPrimarySwitchStatus(
  businessProfileId,
  targetTillId,
) {
  const profile = await prisma.businessProfile.findUnique({
    where: { id: businessProfileId },
    select: { primaryPosTillId: true },
  })
  const primaryPosTillId = profile?.primaryPosTillId ?? null

  if (!primaryPosTillId) {
    return {
      canSwitch: true,
      reason: null,
      primaryPosTillId: null,
      primaryOnline: false,
      pendingUploadCount: 0,
      lastHeartbeatAt: null,
    }
  }

  if (
    typeof targetTillId === 'string' &&
    targetTillId.trim() &&
    targetTillId.trim() === primaryPosTillId
  ) {
    const till = await prisma.posTill.findFirst({
      where: { id: primaryPosTillId, businessProfileId },
      select: {
        lastHeartbeatAt: true,
        pendingUploadCount: true,
      },
    })
    return {
      canSwitch: true,
      reason: null,
      primaryPosTillId,
      primaryOnline: isTillHeartbeatFresh(till?.lastHeartbeatAt),
      pendingUploadCount: Number(till?.pendingUploadCount) || 0,
      lastHeartbeatAt: till?.lastHeartbeatAt?.toISOString() ?? null,
    }
  }

  const till = await prisma.posTill.findFirst({
    where: { id: primaryPosTillId, businessProfileId },
    select: {
      id: true,
      lastHeartbeatAt: true,
      pendingUploadCount: true,
    },
  })

  if (!till) {
    return {
      canSwitch: true,
      reason: null,
      primaryPosTillId: null,
      primaryOnline: false,
      pendingUploadCount: 0,
      lastHeartbeatAt: null,
    }
  }

  const pendingUploadCount = Number(till.pendingUploadCount) || 0
  const primaryOnline = isTillHeartbeatFresh(till.lastHeartbeatAt)
  const lastHeartbeatAt = till.lastHeartbeatAt?.toISOString() ?? null

  if (!primaryOnline) {
    return {
      canSwitch: false,
      reason: 'PRIMARY_TILL_OFFLINE',
      primaryPosTillId,
      primaryOnline: false,
      pendingUploadCount,
      lastHeartbeatAt,
    }
  }

  if (pendingUploadCount > 0) {
    return {
      canSwitch: false,
      reason: 'PRIMARY_TILL_SYNCING',
      primaryPosTillId,
      primaryOnline: true,
      pendingUploadCount,
      lastHeartbeatAt,
    }
  }

  return {
    canSwitch: true,
    reason: null,
    primaryPosTillId,
    primaryOnline: true,
    pendingUploadCount: 0,
    lastHeartbeatAt,
  }
}

/**
 * Assert primary switch is allowed; throws with .code for API mapping.
 *
 * @param {string} businessProfileId
 * @param {string} targetTillId
 */
export async function assertPrimarySwitchAllowed(
  businessProfileId,
  targetTillId,
) {
  const status = await getPrimarySwitchStatus(businessProfileId, targetTillId)
  if (status.canSwitch) return status

  const err = new Error(status.reason || 'PRIMARY_SWITCH_BLOCKED')
  err.code = status.reason || 'PRIMARY_SWITCH_BLOCKED'
  err.details = status
  throw err
}
