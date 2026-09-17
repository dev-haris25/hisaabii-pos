'use client'

import {
  injectSaudiRiyalFontFace,
  inlineComputedReceiptStyles,
} from '@/lib/print/thermal-receipt-computed-styles'

/**
 * html2canvas cannot parse Tailwind v4 `oklch()` / `oklab()` in stylesheets.
 * Bake layout + paint onto inline styles on the live node first, then drop
 * stylesheets in the clone so flex rows, fonts, and spacing match the preview.
 *
 * @param {Document} clonedDoc
 */
function stripModernColorStylesheets(clonedDoc) {
  clonedDoc
    .querySelectorAll('link[rel="stylesheet"], style')
    .forEach((node) => {
      if (node instanceof HTMLElement && node.id === 'hisabi-saudi-riyal-font') {
        return
      }
      node.remove()
    })
}

/**
 * @param {HTMLElement} page
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function captureThermalReceiptCanvas(page) {
  // Off-screen mount only — inline before clone so layout survives stylesheet strip.
  inlineComputedReceiptStyles(page)

  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready
    } catch {
      /* ignore font readiness errors */
    }
  }

  const html2canvas = (await import('html2canvas')).default
  return html2canvas(page, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    onclone(clonedDoc) {
      stripModernColorStylesheets(clonedDoc)
      injectSaudiRiyalFontFace(clonedDoc)
    },
  })
}
