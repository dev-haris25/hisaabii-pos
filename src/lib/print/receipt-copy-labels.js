/** @typedef {'customer' | 'kitchen'} ReceiptCopyKind */

/** Customer first, kitchen second — print order. */
export const RECEIPT_COPY_KINDS = /** @type {const} */ (['customer', 'kitchen'])

/**
 * @param {ReceiptCopyKind} kind
 * @param {string} [locale]
 */
export function receiptCopyLabel(kind, locale = 'en') {
  const ar = locale === 'ar'
  if (kind === 'customer') return ar ? 'نسخة العميل' : 'Customer copy'
  return ar ? 'نسخة المطبخ' : 'Kitchen copy'
}
