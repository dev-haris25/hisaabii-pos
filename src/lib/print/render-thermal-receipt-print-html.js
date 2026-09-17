'use client'

import {
  mountThermalReceiptPages,
  unmountThermalReceiptPages,
} from '@/lib/print/mount-thermal-receipt-pages'
import {
  serializeThermalReceiptInnerHtml,
  wrapThermalReceiptDocument,
} from '@/lib/print/serialize-thermal-receipt-html'

/**
 * Build one Windows print job per receipt copy (customer, then kitchen).
 * Uses the live preview HTML — not a screenshot — so layout matches the UI.
 *
 * @param {{
 *   invoice: Record<string, unknown>
 *   logoUrl?: string | null
 *   documentLabel?: string | null
 *   paperFormat?: 'a4' | 'thermal80'
 * }} opts
 * @returns {Promise<{ html: string, heightMicrons: number, paperFormat: 'a4' | 'thermal80' }[]>}
 */
export async function renderThermalReceiptPrintJobs(opts) {
  const paperFormat = opts.paperFormat === 'a4' ? 'a4' : 'thermal80'
  const mounted = await mountThermalReceiptPages(opts)
  const dir = document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr'
  try {
    return mounted.pages.map((page) => {
      const width = Math.max(page.clientWidth, 1)
      const heightMm = Math.max(
        80,
        Math.ceil(((page.scrollHeight * 80) / width) * 1.12) + 10,
      )
      return {
        html: wrapThermalReceiptDocument(
          serializeThermalReceiptInnerHtml(page, { forThermalPrinter: true }),
          dir,
          { forThermalPrinter: true, paperFormat },
        ),
        heightMicrons: heightMm * 1000,
        paperFormat,
      }
    })
  } finally {
    unmountThermalReceiptPages(mounted)
  }
}
