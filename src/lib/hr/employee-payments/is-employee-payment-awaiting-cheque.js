/**
 * Cheque clearing / finance expense sync is not used in hisabi-pos.
 * Kept for API compatibility with shared UI that may reference the helper.
 *
 * @param {{ paymentMethod?: string }} payment
 */
export function isEmployeePaymentAwaitingCheque(payment) {
  return payment.paymentMethod === 'cheque'
}
