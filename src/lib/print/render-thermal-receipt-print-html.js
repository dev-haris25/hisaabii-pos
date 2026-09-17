'use client'

import { captureThermalReceiptCanvas } from '@/lib/print/html2canvas-thermal'
import {
  mountThermalReceiptPages,
  unmountThermalReceiptPages,
} from '@/lib/print/mount-thermal-receipt-pages'

/**
 * Rasterize the thermal preview and wrap it as print-ready HTML.
 * Windows GDI printers (USB Printing) receive this as a normal print job.
 *
 * @param {{
 *   invoice: Record<string, unknown>
 *   logoUrl?: string | null
 *   documentLabel?: string | null
 * }} opts
 */
export async function renderThermalReceiptPrintHtml(opts) {
  const mounted = await mountThermalReceiptPages(opts)
  try {
    const images = []
    for (const page of mounted.pages) {
      const canvas = await captureThermalReceiptCanvas(page)
      images.push({
        src: canvas.toDataURL('image/png'),
        heightMm: Math.max((canvas.height * 80) / canvas.width, 80),
      })
    }
    const body = images
      .map(
        (img) =>
          `<div class="copy" style="page-break-after:always"><img src="${img.src}" alt="" /></div>`,
      )
      .join('')
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page { size: 80mm auto; margin: 0; }
html, body { margin: 0; padding: 0; width: 80mm; background: #fff; }
.copy { width: 80mm; }
img { width: 80mm; display: block; }
</style></head><body>${body}</body></html>`
  } finally {
    unmountThermalReceiptPages(mounted)
  }
}
