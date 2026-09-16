'use client'

import {
  mountThermalReceiptPages,
  unmountThermalReceiptPages,
} from '@/lib/print/mount-thermal-receipt-pages'

/**
 * @param {{
 *   invoice: Record<string, unknown>
 *   logoUrl?: string | null
 *   documentLabel?: string | null
 *   filename: string
 * }} opts
 */
export async function downloadThermalReceiptPdf(opts) {
  const html2canvas = (await import('html2canvas')).default
  const { jsPDF } = await import('jspdf')
  const mounted = await mountThermalReceiptPages(opts)

  try {
    const pdf = new jsPDF({
      unit: 'mm',
      format: [80, 200],
      hotfixes: ['px_scaling'],
    })

    for (let i = 0; i < mounted.pages.length; i++) {
      const canvas = await html2canvas(mounted.pages[i], {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      })
      const img = canvas.toDataURL('image/png')
      const pageWidth = 80
      const pageHeight = (canvas.height * pageWidth) / canvas.width
      if (i > 0) pdf.addPage([80, Math.max(pageHeight, 80)], 'p')
      else {
        pdf.internal.pageSize.setHeight(Math.max(pageHeight, 80))
      }
      pdf.addImage(img, 'PNG', 0, 0, pageWidth, pageHeight)
    }

    pdf.save(opts.filename)
  } finally {
    unmountThermalReceiptPages(mounted)
  }
}
