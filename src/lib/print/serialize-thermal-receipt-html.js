'use client'

const LAYOUT_PROPS = [
  'boxSizing',
  'display',
  'flexDirection',
  'flexWrap',
  'justifyContent',
  'alignItems',
  'alignSelf',
  'gap',
  'rowGap',
  'columnGap',
  'width',
  'maxWidth',
  'minWidth',
  'height',
  'maxHeight',
  'minHeight',
  'padding',
  'margin',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'lineHeight',
  'letterSpacing',
  'textAlign',
  'textDecoration',
  'whiteSpace',
  'wordBreak',
  'direction',
  'unicodeBidi',
  'color',
  'backgroundColor',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderTopStyle',
  'borderRightStyle',
  'borderBottomStyle',
  'borderLeftStyle',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  'borderRadius',
  'objectFit',
  'objectPosition',
  'overflow',
  'listStyle',
]

/**
 * @param {string} value
 * @param {string} prop
 */
function safeCssValue(value, prop) {
  if (!value || /oklch|oklab|color-mix|\blab\(|\blch\(/i.test(value)) {
    return /background/i.test(prop) ? '#ffffff' : '#111111'
  }
  return value
}

/**
 * @param {HTMLElement} src
 * @param {HTMLElement} dest
 */
function copyComputedLayout(src, dest) {
  const cs = getComputedStyle(src)
  for (const prop of LAYOUT_PROPS) {
    dest.style[prop] = safeCssValue(String(cs[prop] ?? ''), prop)
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
  return `<!DOCTYPE html><html dir="${dir}"><head><meta charset="utf-8"><style>
html, body { margin: 0; padding: 0; width: 80mm; background: #fff; color: #111; }
img { max-width: 100%; height: auto; display: block; }
</style></head><body>${innerHtml}</body></html>`
}
