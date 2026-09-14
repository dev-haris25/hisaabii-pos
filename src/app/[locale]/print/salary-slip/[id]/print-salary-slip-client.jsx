'use client'

import { useEffect, useState } from 'react'

import { SalarySlipDocumentView } from '@/components/hr/salary-slip-document-view'
import { usePrintAutoTrigger } from '@/lib/print/use-print-auto-trigger'

/** @param {{ model: import('@/components/hr/salary-slip-document-view').SalarySlipDocumentModel }} props */
export function PrintSalarySlipClient({ model }) {
  const [ready, setReady] = useState(false)

  usePrintAutoTrigger(ready)

  useEffect(() => {
    let cancelled = false

    async function waitForReady() {
      try {
        if (document.fonts?.ready) await document.fonts.ready
      } catch {
        // ignore font loading errors
      }

      const images = Array.from(document.images)
      await Promise.all(
        images.map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise((resolve) => {
                img.addEventListener('load', resolve, { once: true })
                img.addEventListener('error', resolve, { once: true })
              }),
        ),
      )

      if (!cancelled) setReady(true)
    }

    void waitForReady()
    return () => {
      cancelled = true
    }
  }, [model])

  return (
    <div
      data-salary-slip-print-root
      data-print-ready={ready ? 'true' : 'false'}
      style={{ backgroundColor: '#ffffff', minHeight: '100vh' }}
      className="bg-white"
    >
      <SalarySlipDocumentView model={model} printMode />
    </div>
  )
}
