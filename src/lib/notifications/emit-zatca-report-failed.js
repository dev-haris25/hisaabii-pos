import { notifyPosAudience } from '@/lib/notifications/notify-owner-and-actor'

/**
 * @param {{
 *   businessProfileId: string
 *   actorUserId?: string | null
 *   documentKind: 'invoice' | 'credit' | 'debit'
 *   documentId: string
 *   documentNumber: string
 * }} p
 */
export async function emitZatcaReportFailed(p) {
  const label =
    p.documentKind === 'invoice'
      ? 'Invoice'
      : p.documentKind === 'credit'
        ? 'Credit note'
        : 'Debit note'
  const link =
    p.documentKind === 'invoice'
      ? `/invoices/${p.documentId}`
      : p.documentKind === 'credit'
        ? `/invoices/credit-notes/${p.documentId}`
        : `/invoices/debit-notes/${p.documentId}`

  await notifyPosAudience({
    businessProfileId: p.businessProfileId,
    audience: 'zatca',
    type: 'zatca_report_failed',
    kind: 'zatca',
    vars: { detail: `${label} ${p.documentNumber} failed ZATCA reporting` },
    link,
    dedupeKey: `zatca-failed:${p.documentKind}:${p.documentId}:${Math.floor(Date.now() / 60_000)}`,
    actorUserId: p.actorUserId,
  })
}
