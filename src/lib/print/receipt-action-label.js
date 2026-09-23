'use client'

/**
 * @param {(key: string) => string} t
 * @param {boolean} [isDesktop]
 */
export function receiptActionLabel(t, isDesktop = false) {
  return isDesktop ? t('printReceipt') : t('downloadReceipt')
}

/**
 * @param {(key: string) => string} t
 * @param {boolean} [isDesktop]
 */
export function invoiceReceiptActionLabel(t, isDesktop = false) {
  return isDesktop ? t('actionPrint') : t('downloadReceipt')
}
