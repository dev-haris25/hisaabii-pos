export const MAX_RECEIPT_PRINTERS = 8

/**
 * @param {{ ip: string, port: number }[]} rows
 * @param {{ printerIp?: string | null, printerPort?: number | null } | null} fallback
 */
export function printersForSettingsPayload(rows, fallback) {
  const configured = rows
    .filter((r) => r.ip?.trim())
    .map((r) => ({ ip: r.ip.trim(), port: r.port }))
  if (configured.length > 0) {
    return {
      printers: configured,
      printerIp: configured[0].ip,
      printerPort: configured[0].port,
    }
  }
  const ip = fallback?.printerIp?.trim() || null
  const port = fallback?.printerPort ?? 9100
  return {
    printers: [{ ip: ip ?? '', port }],
    printerIp: ip,
    printerPort: port,
  }
}

/**
 * @param {import('@prisma/client').Prisma.TransactionClient | import('@/lib/prisma').prisma} tx
 * @param {string} businessProfileId
 */
export async function loadReceiptPrinterRows(tx, businessProfileId) {
  return tx.receiptPrinter.findMany({
    where: { businessProfileId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { ip: true, port: true },
  })
}

/**
 * Configured printers for a print job. Empty IPs are skipped.
 * Falls back to BusinessProfile.printerIp when the table has no rows.
 *
 * @param {import('@/lib/prisma').prisma | import('@prisma/client').Prisma.TransactionClient} client
 * @param {string} businessProfileId
 * @returns {Promise<{ ip: string, port: number }[]>}
 */
export async function listConfiguredReceiptPrinters(client, businessProfileId) {
  const rows = await loadReceiptPrinterRows(client, businessProfileId)
  const fromTable = rows
    .filter((r) => r.ip.trim())
    .map((r) => ({ ip: r.ip.trim(), port: r.port }))
  if (fromTable.length > 0) return fromTable

  const profile = await client.businessProfile.findUnique({
    where: { id: businessProfileId },
    select: { printerIp: true, printerPort: true },
  })
  const ip = profile?.printerIp?.trim()
  if (!ip) return []
  return [{ ip, port: profile.printerPort ?? 9100 }]
}

/**
 * Replace all printer rows and keep printerIp/printerPort in sync with the first.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string} businessProfileId
 * @param {{ ip: string, port: number }[]} printers
 */
export async function replaceReceiptPrinters(tx, businessProfileId, printers) {
  const cleaned = printers
    .map((p, index) => ({
      ip: p.ip.trim(),
      port: p.port,
      sortOrder: index,
    }))
    .filter((p) => p.ip.length > 0)
    .slice(0, MAX_RECEIPT_PRINTERS)

  await tx.receiptPrinter.deleteMany({ where: { businessProfileId } })
  if (cleaned.length > 0) {
    await tx.receiptPrinter.createMany({
      data: cleaned.map((p) => ({
        businessProfileId,
        ip: p.ip,
        port: p.port,
        sortOrder: p.sortOrder,
      })),
    })
  }

  const first = cleaned[0]
  await tx.businessProfile.update({
    where: { id: businessProfileId },
    data: {
      printerIp: first?.ip ?? null,
      printerPort: first?.port ?? 9100,
    },
  })
}
