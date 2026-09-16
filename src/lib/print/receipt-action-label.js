'use client'

import { isHisabiDesktop } from '@/lib/desktop/hisabi-desktop'

/**
 * @param {(key: string) => string} t
 */
export function receiptActionLabel(t) {
  return isHisabiDesktop() ? t('printReceipt') : t('downloadReceipt')
}

/**
 * @param {(key: string) => string} t
 */
export function invoiceReceiptActionLabel(t) {
  return isHisabiDesktop() ? t('actionPrint') : t('downloadReceipt')
}
