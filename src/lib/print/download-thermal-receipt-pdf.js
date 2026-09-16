'use client'

import { createRoot } from 'react-dom/client'
import { NextIntlClientProvider } from 'next-intl'

import { PosThermalReceiptPreview } from '@/components/invoices/pos-thermal-receipt-preview'
import { RECEIPT_COPY_KINDS } from '@/lib/print/receipt-copy-labels'

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
  const locale = document.documentElement.lang === 'ar' ? 'ar' : 'en'
  const messages =
    locale === 'ar'
      ? (await import('../../../messages/ar.json')).default
      : (await import('../../../messages/en.json')).default

  const host = document.createElement('div')
  host.setAttribute('data-thermal-pdf-host', '1')
  host.style.cssText =
    'position:fixed;left:-10000px;top:0;width:280px;background:#fff;z-index:-1'
  document.body.appendChild(host)

  const root = createRoot(host)
  await new Promise((resolve) => {
    root.render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <div>
          {RECEIPT_COPY_KINDS.map((kind) => (
            <div
              key={kind}
              data-receipt-copy={kind}
              style={{ width: 280, background: '#fff', padding: 8 }}
            >
              <PosThermalReceiptPreview
                invoice={opts.invoice}
                logoUrl={opts.logoUrl ?? null}
                documentLabel={opts.documentLabel ?? null}
                receiptCopy={kind}
              />
            </div>
          ))}
        </div>
      </NextIntlClientProvider>,
    )
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  })

  await new Promise((r) => setTimeout(r, 400))

  const pages = [...host.querySelectorAll('[data-receipt-copy]')]
  const pdf = new jsPDF({
    unit: 'mm',
    format: [80, 200],
    hotfixes: ['px_scaling'],
  })

  for (let i = 0; i < pages.length; i++) {
    const canvas = await html2canvas(pages[i], {
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
  root.unmount()
  host.remove()
}
