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
  const link =
    p.documentKind === 'invoice'
      ? `/invoices/${p.documentId}`
      : p.documentKind === 'credit'
        ? `/invoices/credit-notes/${p.documentId}`
        : `/invoices/debit-notes/${p.documentId}`

  if (p.documentKind === 'invoice') {
    await notifyPosAudience({
      businessProfileId: p.businessProfileId,
      audience: 'zatca',
      type: 'zatca_report_failed',
      kind: 'zatca',
      vars: { invoiceNumber: p.documentNumber },
      link,
      dedupeKey: `zatca-failed:invoice:${p.documentId}:${Math.floor(Date.now() / 60_000)}`,
      actorUserId: p.actorUserId,
    })
    return
  }

  const label =
    p.documentKind === 'credit' ? 'Credit note' : 'Debit note'
  await notifyPosAudience({
    businessProfileId: p.businessProfileId,
    audience: 'zatca',
    type: 'zatca_report_failed',
    kind: 'zatca',
    title: 'ZATCA reporting failed',
    message: `${label} ${p.documentNumber} failed ZATCA reporting`,
    link,
    dedupeKey: `zatca-failed:${p.documentKind}:${p.documentId}:${Math.floor(Date.now() / 60_000)}`,
    actorUserId: p.actorUserId,
  })
}
