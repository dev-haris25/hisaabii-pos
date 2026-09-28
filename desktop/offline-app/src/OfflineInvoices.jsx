import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Search } from 'lucide-react'

import { PosThermalReceiptPreview } from '@/components/invoices/pos-thermal-receipt-preview.jsx'
import {
  localGetInvoiceDetail,
  localListInvoices,
} from '@/lib/desktop/local-pos-api.js'
import { formatSarAmount } from '@/lib/settings/format-helpers.js'

const PAGE_LIMIT = 20

/**
 * @param {string | null | undefined} iso
 */
function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return String(iso)
  }
}

function zatcaBadgeClass(status) {
  switch (status) {
    case 'CLEARED':
    case 'REPORTED':
      return 'bg-hisabi-primary-container text-hisabi-primary'
    case 'FAILED':
      return 'bg-hisabi-error-container text-hisabi-error'
    default:
      return 'bg-hisabi-surface-container text-hisabi-on-surface-variant'
  }
}

function InvoiceListRow({ invoice, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(invoice.id)}
      className="border-hisabi-outline-variant/40 hover:bg-hisabi-surface-container grid w-full grid-cols-[1fr_auto] items-center gap-2 border-b px-hisabi-md py-hisabi-sm text-start last:border-b-0"
    >
      <div className="min-w-0">
        <p className="type-label-md truncate font-bold text-hisabi-on-surface">
          {invoice.invoiceNumber || invoice.id}
        </p>
        <p className="type-body-sm text-hisabi-on-surface-variant truncate">
          {formatDate(invoice.invoiceDate)}
          {invoice.orderNumber ? ` · #${invoice.orderNumber}` : ''}
          {invoice.staffName ? ` · ${invoice.staffName}` : ''}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="type-label-md font-bold text-hisabi-on-surface">
          {formatSarAmount(invoice.grandTotal)}
        </span>
        {invoice.zatcaStatus ? (
          <span
            className={`type-label-sm rounded-full px-2 py-0.5 font-bold ${zatcaBadgeClass(
              invoice.zatcaStatus,
            )}`}
          >
            {invoice.zatcaStatus}
          </span>
        ) : null}
      </div>
    </button>
  )
}

function InvoiceDetailScreen({ invoiceId, onBack }) {
  const [invoice, setInvoice] = useState(
    /** @type {Record<string, unknown> | null} */ (null),
  )
  const [error, setError] = useState(/** @type {string | null} */ (null))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const data = await localGetInvoiceDetail(invoiceId)
        if (!cancelled) setInvoice(data?.invoice || null)
      } catch {
        if (!cancelled) setError('Could not load this invoice.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [invoiceId])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="border-hisabi-outline-variant/40 sticky top-0 z-10 flex items-center gap-2 border-b bg-hisabi-surface-container-lowest px-hisabi-md py-hisabi-sm">
        <button
          type="button"
          onClick={onBack}
          className="text-hisabi-on-surface-variant hover:bg-hisabi-surface-container inline-flex items-center gap-1 rounded-lg px-2 py-1"
        >
          <ChevronLeft className="size-4" aria-hidden />
          <span className="type-label-md font-bold">Invoices</span>
        </button>
      </div>
      <div className="flex-1 p-hisabi-lg">
        {loading ? (
          <p className="type-body-md text-hisabi-on-surface-variant text-center">
            Loading…
          </p>
        ) : error ? (
          <p className="type-body-md text-hisabi-error text-center">{error}</p>
        ) : !invoice ? (
          <p className="type-body-md text-hisabi-on-surface-variant text-center">
            Invoice not found.
          </p>
        ) : (
          <div className="mx-auto flex max-w-md flex-col gap-hisabi-md">
            {invoice.zatcaLastError ? (
              <p className="type-body-sm text-hisabi-error rounded-lg bg-hisabi-error-container px-hisabi-md py-hisabi-sm">
                {String(invoice.zatcaLastError)}
              </p>
            ) : null}
            <div className="rounded-xl border border-hisabi-outline-variant/50 bg-hisabi-surface-container-lowest shadow-hisabi-2">
              <PosThermalReceiptPreview
                invoice={invoice}
                receiptCopy="customer"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function InvoiceListScreen({ onOpen }) {
  const [search, setSearch] = useState('')
  const [invoices, setInvoices] = useState(/** @type {Array<any>} */ ([]))
  const [pagination, setPagination] = useState(
    /** @type {{ page: number, totalPages: number } | null} */ (null),
  )
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(/** @type {string | null} */ (null))

  const load = useCallback(async (opts) => {
    setLoading(true)
    setError(null)
    try {
      const data = await localListInvoices({
        search: opts.search,
        page: opts.page,
        limit: PAGE_LIMIT,
      })
      setInvoices(Array.isArray(data?.invoices) ? data.invoices : [])
      setPagination(data?.pagination || null)
    } catch {
      setError('Could not load invoices.')
      setInvoices([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load({ search, page })
  }, [load, search, page])

  const hasPrev = (pagination?.page || 1) > 1
  const hasNext = (pagination?.page || 1) < (pagination?.totalPages || 1)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-hisabi-outline-variant/40 border-b bg-hisabi-surface-container-lowest px-hisabi-md py-hisabi-sm">
        <label className="border-hisabi-outline-variant flex items-center gap-2 rounded-lg border px-3 py-2">
          <Search className="text-hisabi-on-surface-variant size-4 shrink-0" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setPage(1)
              setSearch(e.target.value)
            }}
            placeholder="Search invoice number…"
            className="type-body-md w-full bg-transparent text-hisabi-on-surface outline-none"
          />
        </label>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="type-body-md text-hisabi-on-surface-variant p-hisabi-lg text-center">
            Loading…
          </p>
        ) : error ? (
          <p className="type-body-md text-hisabi-error p-hisabi-lg text-center">
            {error}
          </p>
        ) : invoices.length === 0 ? (
          <p className="type-body-md text-hisabi-on-surface-variant p-hisabi-lg text-center">
            No invoices found.
          </p>
        ) : (
          invoices.map((inv) => (
            <InvoiceListRow key={inv.id} invoice={inv} onOpen={onOpen} />
          ))
        )}
      </div>
      {pagination && pagination.totalPages > 1 ? (
        <div className="border-hisabi-outline-variant/40 flex items-center justify-between border-t bg-hisabi-surface-container-lowest px-hisabi-md py-hisabi-sm">
          <button
            type="button"
            disabled={!hasPrev}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="type-label-sm rounded-lg px-3 py-1.5 font-bold text-hisabi-on-surface-variant disabled:opacity-40"
          >
            Previous
          </button>
          <span className="type-label-sm text-hisabi-on-surface-variant">
            {pagination.page} / {pagination.totalPages}
          </span>
          <button
            type="button"
            disabled={!hasNext}
            onClick={() => setPage((p) => p + 1)}
            className="type-label-sm rounded-lg px-3 py-1.5 font-bold text-hisabi-on-surface-variant disabled:opacity-40"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Read-only invoices list + detail for the offline shell (primary till
 * only). No editing, printing, ZATCA reporting, or note actions — see
 * "invoices_scope: readonly_list_detail" decision. Credit/debit notes
 * aren't synced locally so they're omitted from the detail view.
 */
export function OfflineInvoicesScreen() {
  const [selectedId, setSelectedId] = useState(
    /** @type {string | null} */ (null),
  )

  const onOpen = useMemo(() => (id) => setSelectedId(id), [])
  const onBack = useMemo(() => () => setSelectedId(null), [])

  if (selectedId) {
    return <InvoiceDetailScreen invoiceId={selectedId} onBack={onBack} />
  }
  return <InvoiceListScreen onOpen={onOpen} />
}
