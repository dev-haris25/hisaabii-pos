import { notifyPosAudience } from '@/lib/notifications/notify-owner-and-actor'

/**
 * Emitted after the ~23h automatic retry still fails (Step 9).
 *
 * @param {{
 *   businessProfileId: string
 *   actorUserId?: string | null
 *   documentId: string
 *   documentNumber: string
 * }} p
 */
export async function emitZatcaReportStillFailed(p) {
  await notifyPosAudience({
    businessProfileId: p.businessProfileId,
    audience: 'zatca',
    type: 'zatca_report_still_failed',
    kind: 'zatca',
    vars: { invoiceNumber: p.documentNumber },
    link: `/invoices/${p.documentId}`,
    dedupeKey: `zatca-still-failed:invoice:${p.documentId}`,
    actorUserId: p.actorUserId,
  })
}
