'use client'

import {
  safeThermalCssValue,
  saudiRiyalFontFaceCss,
  THERMAL_RECEIPT_LAYOUT_PROPS,
  withSaudiRiyalFont,
} from '@/lib/print/thermal-receipt-computed-styles'

/** Physical roll / slip width (CSS mm). */
export const THERMAL_PAGE_WIDTH_MM = 80

/**
 * Safe content width inside the printable area of typical 80mm heads.
 * Keep close to the on-screen preview (~280px) so lines do not wrap early.
 */
export const THERMAL_PRINT_CONTENT_WIDTH_MM = 76

const PRINT_INK = '#000000'
const PRINT_PAPER = '#ffffff'

/**
 * @param {string} value
 * @param {number} [factor]
 * @param {number} [minPx]
 */
function bumpPx(value, factor = 1.5, minPx = 0) {
  const m = String(value).match(/^([\d.]+)px$/i)
  if (!m) return value
  const n = Number(m[1])
  if (!Number.isFinite(n) || n <= 0) return value
  return `${Math.max(minPx, Math.ceil(n * factor))}px`
}

/**
 * @param {string} lineHeight
 * @param {string} fontSize
 */
function printLineHeight(lineHeight, fontSize) {
  const fontPx = Number(String(fontSize).match(/^([\d.]+)/)?.[1] ?? 0)
  const lhPx = Number(String(lineHeight).match(/^([\d.]+)px$/i)?.[1] ?? 0)
  if (fontPx > 0) {
    const min = Math.ceil(fontPx * 1.35)
    if (lhPx > 0) return `${Math.max(min, Math.ceil(lhPx * 1.1))}px`
    return `${min}px`
  }
  return bumpPx(lineHeight, 1.1, 15)
}

/**
 * @param {HTMLElement} src
 * @param {HTMLElement} dest
 * @param {{ forThermalPrinter?: boolean }} [opts]
 */
function copyComputedLayout(src, dest, opts = {}) {
  const forPrinter = opts.forThermalPrinter === true
  const cs = getComputedStyle(src)
  for (const prop of THERMAL_RECEIPT_LAYOUT_PROPS) {
    let value = safeThermalCssValue(String(cs[prop] ?? ''), prop)

    if (forPrinter) {
      if (prop === 'color') {
        value = PRINT_INK
      } else if (
        prop === 'borderTopColor' ||
        prop === 'borderRightColor' ||
        prop === 'borderBottomColor' ||
        prop === 'borderLeftColor'
      ) {
        const widthProp =
          prop === 'borderTopColor'
            ? 'borderTopWidth'
            : prop === 'borderRightColor'
              ? 'borderRightWidth'
              : prop === 'borderBottomColor'
                ? 'borderBottomWidth'
                : 'borderLeftWidth'
        const w = Number.parseFloat(String(cs[widthProp] ?? '0'))
        value = w > 0 ? PRINT_INK : value
      } else if (prop === 'backgroundColor') {
        value = PRINT_PAPER
      } else if (prop === 'lineHeight') {
        value = printLineHeight(value, cs.fontSize)
      } else if (prop === 'marginTop' || prop === 'marginBottom') {
        value = bumpPx(value, 1.4, value === '0px' ? 0 : 3)
      } else if (prop === 'rowGap' || prop === 'columnGap' || prop === 'gap') {
        value = bumpPx(value, 1.25, 3)
      } else if (prop === 'flexWrap') {
        value = 'nowrap'
      } else if (prop === 'whiteSpace' && cs.display.includes('flex')) {
        value = 'nowrap'
      }
    }

    if (prop === 'fontFamily') {
      dest.style.fontFamily = withSaudiRiyalFont(value)
    } else {
      dest.style[prop] = value
    }
  }
  dest.style.boxShadow = 'none'
  dest.style.textShadow = 'none'
  if (forPrinter) {
    dest.style.color = PRINT_INK
    if (String(cs.display).includes('flex')) {
      dest.style.flexWrap = 'nowrap'
      dest.style.alignItems = 'baseline'
    }
  }
}

const PRINT_SHARED_RULES = `
* {
  color: ${PRINT_INK} !important;
  border-top-color: ${PRINT_INK} !important;
  border-right-color: ${PRINT_INK} !important;
  border-bottom-color: ${PRINT_INK} !important;
  border-left-color: ${PRINT_INK} !important;
  box-shadow: none !important;
  text-shadow: none !important;
}
div[style*="display: flex"],
div[style*="display:flex"] {
  flex-wrap: nowrap !important;
}
div[style*="display: flex"] > span,
div[style*="display:flex"] > span {
  white-space: nowrap;
  flex-shrink: 0;
}
div[style*="display: flex"] > span:first-child,
div[style*="display:flex"] > span:first-child {
  flex-shrink: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
img {
  max-width: 100%;
  height: auto;
  display: block;
  -webkit-filter: contrast(1.15);
  filter: contrast(1.15);
}
`

/**
 * Snapshot the on-screen thermal preview so the print window matches it
 * without Tailwind / html2canvas.
 *
 * @param {HTMLElement} root
 * @param {{ forThermalPrinter?: boolean }} [opts]
 */
export function serializeThermalReceiptInnerHtml(root, opts = {}) {
  const forPrinter = opts.forThermalPrinter === true
  const source =
    root.firstElementChild instanceof HTMLElement ? root.firstElementChild : root
  const clone = /** @type {HTMLElement} */ (source.cloneNode(true))
  const srcNodes = [source, ...source.querySelectorAll('*')]
  const destNodes = [clone, ...clone.querySelectorAll('*')]
  for (let i = 0; i < srcNodes.length; i++) {
    const src = srcNodes[i]
    const dest = destNodes[i]
    if (!(src instanceof HTMLElement) || !(dest instanceof HTMLElement)) continue
    copyComputedLayout(src, dest, { forThermalPrinter: forPrinter })
  }
  clone.style.margin = '0'
  clone.style.backgroundColor = PRINT_PAPER
  if (forPrinter) {
    clone.style.boxSizing = 'border-box'
    clone.style.width = '100%'
    clone.style.maxWidth = '100%'
    clone.style.color = PRINT_INK
  } else {
    clone.style.width = `${THERMAL_PAGE_WIDTH_MM}mm`
    clone.style.maxWidth = `${THERMAL_PAGE_WIDTH_MM}mm`
  }
  return clone.outerHTML
}

/**
 * @param {string} innerHtml
 * @param {'ltr' | 'rtl'} dir
 * @param {{
 *   forThermalPrinter?: boolean
 *   paperFormat?: 'a4' | 'thermal80'
 * }} [opts]
 */
export function wrapThermalReceiptDocument(innerHtml, dir, opts = {}) {
  const forPrinter = opts.forThermalPrinter === true
  const paperFormat = opts.paperFormat === 'a4' ? 'a4' : 'thermal80'
  const fontCss = saudiRiyalFontFaceCss()

  if (!forPrinter) {
    return `<!DOCTYPE html><html dir="${dir}"><head><meta charset="utf-8"><style>
html, body { margin: 0; padding: 0; width: ${THERMAL_PAGE_WIDTH_MM}mm; background: #fff; color: #111; }
img { max-width: 100%; height: auto; display: block; }
${fontCss}
</style></head><body>${innerHtml}</body></html>`
  }

  const sidePad = (THERMAL_PAGE_WIDTH_MM - THERMAL_PRINT_CONTENT_WIDTH_MM) / 2

  // Normal office printer: real A4 page so 80mm CSS = true 80mm on paper.
  if (paperFormat === 'a4') {
    return `<!DOCTYPE html><html dir="${dir}"><head><meta charset="utf-8"><style>
@page {
  size: A4 portrait;
  margin: 0;
}
html, body {
  margin: 0;
  padding: 0;
  width: 210mm;
  min-height: 297mm;
  background: ${PRINT_PAPER};
  color: ${PRINT_INK};
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
body {
  box-sizing: border-box;
  padding: 12mm;
}
.receipt-slip {
  box-sizing: border-box;
  width: ${THERMAL_PAGE_WIDTH_MM}mm;
  max-width: ${THERMAL_PAGE_WIDTH_MM}mm;
  padding: 1.5mm ${sidePad}mm 3mm;
  color: ${PRINT_INK};
  font-weight: 400;
  background: ${PRINT_PAPER};
}
${PRINT_SHARED_RULES}
${fontCss}
</style></head><body><div class="receipt-slip">${innerHtml}</div></body></html>`
  }

  return `<!DOCTYPE html><html dir="${dir}"><head><meta charset="utf-8"><style>
@page {
  size: ${THERMAL_PAGE_WIDTH_MM}mm auto;
  margin: 0;
}
html, body {
  margin: 0;
  padding: 0;
  width: ${THERMAL_PAGE_WIDTH_MM}mm;
  max-width: ${THERMAL_PAGE_WIDTH_MM}mm;
  background: ${PRINT_PAPER};
  color: ${PRINT_INK};
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
body {
  box-sizing: border-box;
  padding: 1.5mm ${sidePad}mm 3mm;
  color: ${PRINT_INK};
  font-weight: 400;
}
${PRINT_SHARED_RULES}
${fontCss}
</style></head><body>${innerHtml}</body></html>`
}
