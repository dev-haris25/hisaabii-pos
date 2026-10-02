import { notifyPosAudience } from '@/lib/notifications/notify-owner-and-actor'

/**
 * In-app notification (toast + sheet) when a guest cancels an E-Waiter round.
 * Recipients: restaurant owner + Admin / Manager / Cashier.
 *
 * @param {{
 *   businessProfileId: string
 *   kitchenOrderId: string
 *   orderNumber: number | string
 *   roundNumber?: number | string | null
 *   tableName?: string | null
 * }} p
 */
export async function notifyGuestEWaiterRoundCancelled(p) {
  const orderNumber = String(p.orderNumber ?? '')
  const roundNumber = String(p.roundNumber ?? '')
  const tableName = String(p.tableName ?? '').trim() || '—'

  await notifyPosAudience({
    businessProfileId: p.businessProfileId,
    audience: 'eWaiterFloor',
    kind: 'salesOps',
    type: 'e_waiter_round_cancelled',
    vars: {
      orderNumber,
      roundNumber,
      tableName,
    },
    link: '/kitchen',
    dedupeKey: `e_waiter_round_cancelled:${p.kitchenOrderId}`,
  })
}
