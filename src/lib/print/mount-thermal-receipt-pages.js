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
 * }} opts
 * @returns {Promise<{
 *   host: HTMLDivElement
 *   root: import('react-dom/client').Root
 *   pages: HTMLElement[]
 * }>}
 */
export async function mountThermalReceiptPages(opts) {
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
  await Promise.all(
    [...host.querySelectorAll('img')].map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete) {
            resolve(undefined)
            return
          }
          img.addEventListener('load', () => resolve(undefined), { once: true })
          img.addEventListener('error', () => resolve(undefined), { once: true })
        }),
    ),
  )

  const pages = [...host.querySelectorAll('[data-receipt-copy]')].filter(
    (el) => el instanceof HTMLElement,
  )
  return { host, root, pages }
}

/**
 * @param {{ host: HTMLDivElement, root: import('react-dom/client').Root }} mounted
 */
export function unmountThermalReceiptPages(mounted) {
  mounted.root.unmount()
  mounted.host.remove()
}
