import { useEffect, useState } from 'react'

/**
 * Tracks the "To" email field for document send sheets.
 *
 * @param {boolean} open
 * @param {string} defaultToEmail
 */
export function useSendSheetToEmail(open, defaultToEmail) {
  const [toEmail, setToEmail] = useState('')

  useEffect(() => {
    if (!open) return
    setToEmail(defaultToEmail ?? '')
  }, [open, defaultToEmail])

  return {
    toEmail,
    setToEmail,
    canSend: Boolean(toEmail.trim()),
  }
}
