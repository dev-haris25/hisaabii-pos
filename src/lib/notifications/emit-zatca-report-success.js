import { notifyPosAudience } from '@/lib/notifications/notify-owner-and-actor'

/**
 * @param {{
 *   businessProfileId: string
 *   actorUserId?: string | null
 *   documentId: string
 *   documentNumber: string
 * }} p
 */
export async function emitZatcaReportSuccess(p) {
  await notifyPosAudience({
    businessProfileId: p.businessProfileId,
    audience: 'zatca',
    type: 'zatca_report_success',
    kind: 'zatca',
    vars: { invoiceNumber: p.documentNumber },
    link: `/invoices/${p.documentId}`,
    dedupeKey: `zatca-success:invoice:${p.documentId}`,
    actorUserId: p.actorUserId,
  })
}
