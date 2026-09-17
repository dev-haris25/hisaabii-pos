'use client'

const COLOR_PROPS = [
  'color',
  'backgroundColor',
  'borderColor',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  'outlineColor',
  'textDecorationColor',
]

/**
 * html2canvas cannot parse Tailwind v4 `oklch()` / `oklab()`.
 * Inline computed sRGB on the clone and drop stylesheets so capture works.
 *
 * @param {HTMLElement} root
 */
function inlineComputedPaint(root) {
  const nodes = [root, ...root.querySelectorAll('*')]
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue
    const cs = getComputedStyle(node)
    for (const prop of COLOR_PROPS) {
      const value = String(cs[prop] ?? '')
      if (/oklch|oklab|color-mix|\blab\(|\blch\(/i.test(value) || !value) {
        node.style[prop] =
          prop === 'backgroundColor' || prop === 'background' ? '#ffffff' : '#111111'
      } else {
        node.style[prop] = value
      }
    }
    node.style.boxShadow = 'none'
    node.style.textShadow = 'none'
  }
}

/**
 * @param {Document} clonedDoc
 */
function stripModernColorStylesheets(clonedDoc) {
  clonedDoc
    .querySelectorAll('link[rel="stylesheet"], style')
    .forEach((node) => node.remove())
}

/**
 * @param {HTMLElement} page
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function captureThermalReceiptCanvas(page) {
  const html2canvas = (await import('html2canvas')).default
  return html2canvas(page, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    onclone(_clonedDoc, clonedEl) {
      if (clonedEl instanceof HTMLElement) {
        inlineComputedPaint(clonedEl)
      }
      stripModernColorStylesheets(_clonedDoc)
    },
  })
}
