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
 * Content width inside the slip. Keep close to preview (~280px) so rows fit.
 */
export const THERMAL_PRINT_CONTENT_WIDTH_MM = 78

const PRINT_INK = '#000000'
const PRINT_PAPER = '#ffffff'
const SAR_GLYPH = '\u20C1'

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
    if (lhPx > 0) return `${Math.max(min, Math.ceil(lhPx * 1.15))}px`
    return `${min}px`
  }
  return bumpPx(lineHeight, 1.15, 16)
}

/**
 * Electron print often lacks the Saudi Riyal webfont — U+20C1 becomes `#`
 * and blows row width. Use plain "SAR" in the print HTML only.
 *
 * @param {HTMLElement} root
 */
function replaceSarGlyphForPrint(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  /** @type {Text[]} */
  const nodes = []
  while (walker.nextNode()) {
    const node = walker.currentNode
    if (node instanceof Text) nodes.push(node)
  }
  for (const node of nodes) {
    if (!node.nodeValue?.includes(SAR_GLYPH)) continue
    node.nodeValue = node.nodeValue.split(SAR_GLYPH).join('SAR')
  }
}

/**
 * Flex + justify-between clips in Chromium print. Two-child rows become
 * a fixed table so label and value both stay visible on one line.
 *
 * @param {HTMLElement} root
 */
function convertLabelValueFlexRowsToTable(root) {
  const candidates = [root, ...root.querySelectorAll('*')].filter(
    (el) => el instanceof HTMLElement,
  )
  for (const el of candidates) {
    const display = String(el.style.display || '').toLowerCase()
    if (!display.includes('flex')) continue
    const kids = [...el.children].filter((c) => c instanceof HTMLElement)
    if (kids.length !== 2) continue

    el.style.display = 'table'
    el.style.width = '100%'
    el.style.maxWidth = '100%'
    el.style.tableLayout = 'fixed'
    el.style.borderCollapse = 'collapse'
    el.style.gap = ''
    el.style.columnGap = ''
    el.style.rowGap = ''
    el.style.justifyContent = ''
    el.style.flexWrap = ''
    el.style.overflow = 'visible'

    const [left, right] = kids
    left.style.display = 'table-cell'
    left.style.width = '42%'
    left.style.verticalAlign = 'top'
    left.style.textAlign = 'start'
    left.style.paddingRight = '6px'
    left.style.whiteSpace = 'normal'
    left.style.overflow = 'visible'
    left.style.wordBreak = 'break-word'
    left.style.flexShrink = ''
    left.style.minWidth = '0'

    right.style.display = 'table-cell'
    right.style.width = '58%'
    right.style.verticalAlign = 'top'
    right.style.textAlign = 'end'
    right.style.whiteSpace = 'normal'
    right.style.overflow = 'visible'
    right.style.wordBreak = 'break-word'
    right.style.flexShrink = ''
    right.style.minWidth = '0'
  }
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
        value = bumpPx(value, 1.5, value === '0px' ? 0 : 4)
      } else if (prop === 'rowGap' || prop === 'columnGap' || prop === 'gap') {
        value = bumpPx(value, 1.25, 4)
      } else if (prop === 'overflow') {
        value = 'visible'
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
    dest.style.overflow = 'visible'
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
  overflow: visible !important;
}
img {
  max-width: 100%;
  height: auto;
  display: block;
}
`

/**
 * Thermal / mono Windows print: turn soft logo colors into solid black ink.
 * Transparent pixels stay white (no burn).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {number} [threshold]
 */
function binarizeCanvasInPlace(ctx, width, height, threshold = 200) {
  const image = ctx.getImageData(0, 0, width, height)
  const data = image.data
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] ?? 255
    if (a < 28) {
      data[i] = 255
      data[i + 1] = 255
      data[i + 2] = 255
      data[i + 3] = 255
      continue
    }
    const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    // Fade toward white as alpha drops so soft edges don't smear gray.
    const yAdj = y + ((255 - a) * (255 - y)) / 255
    const v = yAdj < threshold ? 0 : 255
    data[i] = v
    data[i + 1] = v
    data[i + 2] = v
    data[i + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
}

/**
 * @param {CanvasImageSource} source
 * @param {number} width
 * @param {number} height
 * @returns {string | null}
 */
function canvasSourceToBinarizedPngDataUrl(source, width, height) {
  if (!width || !height) return null
  try {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(source, 0, 0, width, height)
    binarizeCanvasInPlace(ctx, width, height)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

/**
 * @param {string} src
 * @returns {Promise<HTMLImageElement>}
 */
function loadHtmlImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'sync'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = src
  })
}

/**
 * Electron print loads `data:text/html` with no session cookies, so relative
 * `/api/auth/.../logo` URLs fail. Embed imgs as pure black/white data URLs so
 * thermal / mono drivers burn a solid logo (not washed-out gray).
 *
 * @param {HTMLElement} source
 * @param {HTMLElement} clone
 */
async function inlineImagesAsDataUrls(source, clone) {
  const srcImgs = [...source.querySelectorAll('img')]
  const destImgs = [...clone.querySelectorAll('img')]
  const n = Math.min(srcImgs.length, destImgs.length)
  for (let i = 0; i < n; i++) {
    const srcImg = srcImgs[i]
    const destImg = destImgs[i]
    if (!(srcImg instanceof HTMLImageElement) || !(destImg instanceof HTMLImageElement)) {
      continue
    }
    const existing = String(srcImg.currentSrc || srcImg.src || '')
    if (!existing) continue

    let dataUrl = /** @type {string | null} */ (null)
    const w = srcImg.naturalWidth
    const h = srcImg.naturalHeight
    if (w > 0 && h > 0) {
      dataUrl = canvasSourceToBinarizedPngDataUrl(srcImg, w, h)
    }

    if (!dataUrl && !existing.startsWith('data:')) {
      try {
        const res = await fetch(existing, { credentials: 'include' })
        if (res.ok) {
          const blob = await res.blob()
          const objectUrl = URL.createObjectURL(blob)
          try {
            const loaded = await loadHtmlImage(objectUrl)
            dataUrl = canvasSourceToBinarizedPngDataUrl(
              loaded,
              loaded.naturalWidth,
              loaded.naturalHeight,
            )
          } finally {
            URL.revokeObjectURL(objectUrl)
          }
        }
      } catch {
        dataUrl = null
      }
    }

    if (!dataUrl && existing.startsWith('data:')) {
      try {
        const loaded = await loadHtmlImage(existing)
        dataUrl = canvasSourceToBinarizedPngDataUrl(
          loaded,
          loaded.naturalWidth,
          loaded.naturalHeight,
        )
      } catch {
        dataUrl = existing
      }
    }

    if (dataUrl) destImg.setAttribute('src', dataUrl)
  }
}

/**
 * Snapshot the on-screen thermal preview so the print window matches it
 * without Tailwind / html2canvas.
 *
 * @param {HTMLElement} root
 * @param {{ forThermalPrinter?: boolean }} [opts]
 * @returns {Promise<string>}
 */
export async function serializeThermalReceiptInnerHtml(root, opts = {}) {
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
    clone.style.overflow = 'visible'
    await inlineImagesAsDataUrls(source, clone)
    replaceSarGlyphForPrint(clone)
    convertLabelValueFlexRowsToTable(clone)
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
  padding: 2mm ${sidePad}mm 4mm;
  color: ${PRINT_INK};
  font-weight: 400;
  background: ${PRINT_PAPER};
  overflow: visible;
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
  padding: 2mm ${sidePad}mm 4mm;
  color: ${PRINT_INK};
  font-weight: 400;
  overflow: visible;
}
${PRINT_SHARED_RULES}
${fontCss}
</style></head><body>${innerHtml}</body></html>`
}
