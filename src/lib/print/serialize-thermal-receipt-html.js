'use client'

import {
  safeThermalCssValue,
  saudiRiyalFontFaceCss,
  THERMAL_RECEIPT_LAYOUT_PROPS,
  withSaudiRiyalFont,
} from '@/lib/print/thermal-receipt-computed-styles'

/**
 * @param {HTMLElement} src
 * @param {HTMLElement} dest
 */
function copyComputedLayout(src, dest) {
  const cs = getComputedStyle(src)
  for (const prop of THERMAL_RECEIPT_LAYOUT_PROPS) {
    const value = safeThermalCssValue(String(cs[prop] ?? ''), prop)
    if (prop === 'fontFamily') {
      dest.style.fontFamily = withSaudiRiyalFont(value)
    } else {
      dest.style[prop] = value
    }
  }
  dest.style.boxShadow = 'none'
  dest.style.textShadow = 'none'
}

/**
 * Snapshot the on-screen thermal preview so the print window matches it
 * without Tailwind / html2canvas.
 *
 * @param {HTMLElement} root
 */
export function serializeThermalReceiptInnerHtml(root) {
  const source =
    root.firstElementChild instanceof HTMLElement ? root.firstElementChild : root
  const clone = /** @type {HTMLElement} */ (source.cloneNode(true))
  const srcNodes = [source, ...source.querySelectorAll('*')]
  const destNodes = [clone, ...clone.querySelectorAll('*')]
  for (let i = 0; i < srcNodes.length; i++) {
    const src = srcNodes[i]
    const dest = destNodes[i]
    if (!(src instanceof HTMLElement) || !(dest instanceof HTMLElement)) continue
    copyComputedLayout(src, dest)
  }
  clone.style.width = '80mm'
  clone.style.maxWidth = '80mm'
  clone.style.margin = '0'
  clone.style.backgroundColor = '#ffffff'
  return clone.outerHTML
}

/**
 * @param {string} innerHtml
 * @param {'ltr' | 'rtl'} dir
 */
export function wrapThermalReceiptDocument(innerHtml, dir) {
  const fontCss = saudiRiyalFontFaceCss()
  return `<!DOCTYPE html><html dir="${dir}"><head><meta charset="utf-8"><style>
html, body { margin: 0; padding: 0; width: 80mm; background: #fff; color: #111; }
img { max-width: 100%; height: auto; display: block; }
${fontCss}
</style></head><body>${innerHtml}</body></html>`
}
