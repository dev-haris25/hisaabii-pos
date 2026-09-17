'use client'

import {
  safeThermalCssValue,
  saudiRiyalFontFaceCss,
  THERMAL_RECEIPT_LAYOUT_PROPS,
  withSaudiRiyalFont,
} from '@/lib/print/thermal-receipt-computed-styles'

/** Physical roll width sent to the Windows printer (microns use 80mm). */
export const THERMAL_PAGE_WIDTH_MM = 80

/**
 * Safe content width inside the printable area of typical 80mm heads
 * (hardware unprintable margins ~4mm each side).
 */
export const THERMAL_PRINT_CONTENT_WIDTH_MM = 72

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
    const min = Math.ceil(fontPx * 1.4)
    if (lhPx > 0) return `${Math.max(min, Math.ceil(lhPx * 1.25))}px`
    return `${min}px`
  }
  return bumpPx(lineHeight, 1.25, 16)
}

/**
 * @param {string} fontSize
 */
function printFontSize(fontSize) {
  const m = String(fontSize).match(/^([\d.]+)px$/i)
  if (!m) return fontSize
  const n = Number(m[1])
  if (!Number.isFinite(n) || n <= 0) return fontSize
  // Keep thermal text a touch larger than the screen preview.
  if (n <= 10) return '12px'
  if (n <= 11) return '13px'
  if (n <= 14) return `${Math.ceil(n + 1)}px`
  return `${Math.ceil(n)}px`
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
        // Keep dashed rules visible as solid black on thermal.
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
      } else if (prop === 'fontSize') {
        value = printFontSize(value)
      } else if (prop === 'lineHeight') {
        value = printLineHeight(value, cs.fontSize)
      } else if (prop === 'marginTop' || prop === 'marginBottom') {
        value = bumpPx(value, 1.75, value === '0px' ? 0 : 4)
      } else if (prop === 'rowGap' || prop === 'columnGap' || prop === 'gap') {
        value = bumpPx(value, 1.5, 4)
      } else if (
        prop === 'paddingTop' ||
        prop === 'paddingBottom' ||
        prop === 'padding'
      ) {
        value = bumpPx(value, 1.15, 0)
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
    dest.style.webkitFontSmoothing = 'none'
  }
}

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
    // Body already applies side safe-inset; fill the printable column.
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
 * @param {{ forThermalPrinter?: boolean }} [opts]
 */
export function wrapThermalReceiptDocument(innerHtml, dir, opts = {}) {
  const forPrinter = opts.forThermalPrinter === true
  const fontCss = saudiRiyalFontFaceCss()

  if (!forPrinter) {
    return `<!DOCTYPE html><html dir="${dir}"><head><meta charset="utf-8"><style>
html, body { margin: 0; padding: 0; width: ${THERMAL_PAGE_WIDTH_MM}mm; background: #fff; color: #111; }
img { max-width: 100%; height: auto; display: block; }
${fontCss}
</style></head><body>${innerHtml}</body></html>`
  }

  // 80mm roll, inset so text clears typical ~4mm hardware margins each side.
  const sidePad = (THERMAL_PAGE_WIDTH_MM - THERMAL_PRINT_CONTENT_WIDTH_MM) / 2
  return `<!DOCTYPE html><html dir="${dir}"><head><meta charset="utf-8"><style>
html, body {
  margin: 0;
  padding: 0;
  width: ${THERMAL_PAGE_WIDTH_MM}mm;
  background: ${PRINT_PAPER};
  color: ${PRINT_INK};
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
body {
  box-sizing: border-box;
  padding: 1.5mm ${sidePad}mm 3mm;
  color: ${PRINT_INK};
  font-weight: 600;
  -webkit-font-smoothing: none;
  text-rendering: geometricPrecision;
}
* {
  color: ${PRINT_INK} !important;
  border-top-color: ${PRINT_INK} !important;
  border-right-color: ${PRINT_INK} !important;
  border-bottom-color: ${PRINT_INK} !important;
  border-left-color: ${PRINT_INK} !important;
  box-shadow: none !important;
  text-shadow: none !important;
}
img {
  max-width: 100%;
  height: auto;
  display: block;
  -webkit-filter: contrast(1.2);
  filter: contrast(1.2);
}
${fontCss}
</style></head><body>${innerHtml}</body></html>`
}
