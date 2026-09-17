'use client'

/**
 * Layout + paint props needed for thermal receipt print/PDF after Tailwind
 * stylesheets are removed (Electron print window + html2canvas).
 */
export const THERMAL_RECEIPT_LAYOUT_PROPS = [
  'boxSizing',
  'display',
  'flexDirection',
  'flexWrap',
  'flex',
  'flexGrow',
  'flexShrink',
  'flexBasis',
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
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
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
  'listStyleType',
  'listStylePosition',
  'verticalAlign',
]

const SAUDI_RIYAL_FONT = 'Hisabi Saudi Riyal'

const COLOR_STYLE_PROPS = new Set([
  'color',
  'backgroundColor',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  'outlineColor',
  'textDecorationColor',
])

/**
 * @param {string} value
 * @param {string} prop
 */
export function safeThermalCssValue(value, prop) {
  if (!value) return value
  if (!/oklch|oklab|color-mix|\blab\(|\blch\(/i.test(value)) return value
  if (!COLOR_STYLE_PROPS.has(prop)) return value
  return prop === 'backgroundColor' ? '#ffffff' : '#111111'
}

/**
 * Keep the SAR glyph font in the stack so U+20C1 still renders after
 * stylesheets are stripped.
 *
 * @param {string} fontFamily
 */
export function withSaudiRiyalFont(fontFamily) {
  const raw = String(fontFamily ?? '').trim()
  if (!raw) {
    return `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace, '${SAUDI_RIYAL_FONT}'`
  }
  if (raw.toLowerCase().includes('saudi riyal')) return raw
  return `${raw}, '${SAUDI_RIYAL_FONT}'`
}

/**
 * @param {Document} [doc]
 */
export function saudiRiyalFontFaceCss(doc = document) {
  const origin =
    typeof doc?.defaultView?.location?.origin === 'string'
      ? doc.defaultView.location.origin
      : typeof window !== 'undefined'
        ? window.location.origin
        : ''
  if (!origin) return ''
  return `
@font-face {
  font-family: '${SAUDI_RIYAL_FONT}';
  src: url('${origin}/fonts/saudi-riyal.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
  unicode-range: U+20C1;
}
@font-face {
  font-family: '${SAUDI_RIYAL_FONT}';
  src: url('${origin}/fonts/saudi-riyal-bold.woff2') format('woff2');
  font-weight: 700;
  font-style: normal;
  font-display: swap;
  unicode-range: U+20C1;
}
`.trim()
}

/**
 * @param {Document} doc
 */
export function injectSaudiRiyalFontFace(doc) {
  const css = saudiRiyalFontFaceCss(doc)
  if (!css || doc.getElementById('hisabi-saudi-riyal-font')) return
  const style = doc.createElement('style')
  style.id = 'hisabi-saudi-riyal-font'
  style.textContent = css
  doc.head?.appendChild(style)
}

/**
 * Bake computed layout/paint onto element inline styles so the receipt
 * still looks correct without Tailwind stylesheets.
 *
 * @param {HTMLElement} root
 * @param {Document} [viewDoc] document whose defaultView provides getComputedStyle
 */
export function inlineComputedReceiptStyles(root, viewDoc = document) {
  const view = viewDoc.defaultView || window
  const nodes = [root, ...root.querySelectorAll('*')]
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue
    const cs = view.getComputedStyle(node)
    for (const prop of THERMAL_RECEIPT_LAYOUT_PROPS) {
      const value = safeThermalCssValue(String(cs[prop] ?? ''), prop)
      if (prop === 'fontFamily') {
        node.style.fontFamily = withSaudiRiyalFont(value)
      } else {
        node.style[prop] = value
      }
    }
    node.style.boxShadow = 'none'
    node.style.textShadow = 'none'
  }
}
