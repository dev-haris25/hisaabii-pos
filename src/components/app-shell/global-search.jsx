'use client'

import { Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  startTransition,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

import { HisabiSpinner } from '@/components/hisabi-spinner'
import { useRouter } from '@/i18n/navigation'
import { globalSearchRequest } from '@/lib/global-search-client'
import { cn } from '@/lib/utils'

const DEBOUNCE_MS = 300

/** @type {Array<{ key: string, labelKey: string }>} */
const GROUP_ORDER = [
  { key: 'menuItems', labelKey: 'searchGroupMenuItems' },
  { key: 'menuCategories', labelKey: 'searchGroupMenuCategories' },
  { key: 'invoices', labelKey: 'searchGroupInvoices' },
  { key: 'creditNotes', labelKey: 'searchGroupCreditNotes' },
  { key: 'debitNotes', labelKey: 'searchGroupDebitNotes' },
  { key: 'employees', labelKey: 'searchGroupEmployees' },
]

/**
 * Header universal search — RBAC-filtered, debounced dropdown.
 * Results panel is portaled (header is overflow-hidden, same as notifications).
 * Remount on route change via `key={pathname}` from the shell so the panel resets.
 *
 * @param {{
 *   disabled?: boolean
 *   autoFocus?: boolean
 *   className?: string
 *   inputClassName?: string
 *   panelClassName?: string
 *   onNavigate?: () => void
 * }} [props]
 */
export function GlobalSearch({
  disabled = false,
  autoFocus = false,
  className,
  inputClassName,
  panelClassName,
  onNavigate,
}) {
  const t = useTranslations('AppShell')
  const router = useRouter()
  const listboxId = useId()
  const rootRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null))
  const panelRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const requestIdRef = useRef(0)

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mounted, setMounted] = useState(false)
  /** @type {[{ top: number, left: number, width: number } | null, Function]} */
  const [panelBox, setPanelBox] = useState(null)
  /** @type {[Record<string, Array<{id: string, title: string, subtitle?: string | null, href: string}>> | null, Function]} */
  const [results, setResults] = useState(null)

  const trimmed = query.trim()
  const active = !disabled && trimmed.length > 0

  const visibleGroups = useMemo(() => {
    if (!results || disabled) return []
    return GROUP_ORDER.map((group) => ({
      ...group,
      label: t(group.labelKey),
      items: Array.isArray(results[group.key]) ? results[group.key] : [],
    })).filter((group) => group.items.length > 0)
  }, [results, disabled, t])

  const totalHits = visibleGroups.reduce(
    (sum, group) => sum + group.items.length,
    0,
  )
  const showPanel = open && active
  const showLoading = active && loading

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!autoFocus || disabled) return
    inputRef.current?.focus()
  }, [autoFocus, disabled])

  useLayoutEffect(() => {
    if (!showPanel) {
      setPanelBox(null)
      return undefined
    }

    function updateBox() {
      const el = rootRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setPanelBox({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, Math.min(288, window.innerWidth - 16)),
      })
    }

    updateBox()
    window.addEventListener('resize', updateBox)
    window.addEventListener('scroll', updateBox, true)
    return () => {
      window.removeEventListener('resize', updateBox)
      window.removeEventListener('scroll', updateBox, true)
    }
  }, [showPanel, query])

  /** Hand the measured geometry to `.hisabi-floating-panel` via CSS custom properties. */
  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el || !panelBox) return
    el.style.setProperty('--hisabi-floating-top', `${panelBox.top}px`)
    el.style.setProperty('--hisabi-floating-left', `${panelBox.left}px`)
    el.style.setProperty('--hisabi-floating-width', `${panelBox.width}px`)
  }, [panelBox, mounted, showPanel])

  useEffect(() => {
    if (!showPanel) return undefined

    function handleOutside(event) {
      const target = /** @type {Node | null} */ (event.target)
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return
      }
      setOpen(false)
    }

    function handleKey(event) {
      if (event.key === 'Escape') {
        setOpen(false)
        inputRef.current?.blur()
      }
    }

    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [showPanel])

  useEffect(() => {
    if (!active) return undefined

    const requestId = ++requestIdRef.current
    startTransition(() => {
      setOpen(true)
      setLoading(true)
      setError('')
    })

    const timer = window.setTimeout(async () => {
      try {
        const data = await globalSearchRequest(trimmed)
        if (requestId !== requestIdRef.current) return
        startTransition(() => {
          setResults(data && typeof data === 'object' ? data : {})
          setError('')
          setLoading(false)
        })
      } catch (caught) {
        if (requestId !== requestIdRef.current) return
        startTransition(() => {
          setResults(null)
          setError(caught?.message || t('searchError'))
          setLoading(false)
        })
      }
    }, DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [trimmed, active, t])

  function handleSelect(href) {
    setOpen(false)
    setQuery('')
    setResults(null)
    onNavigate?.()
    router.push(href)
  }

  const panel =
    showPanel && mounted && panelBox
      ? createPortal(
          <div
            ref={panelRef}
            id={listboxId}
            role="listbox"
            aria-label={t('searchResultsAria')}
            className={cn(
              'hisabi-global-search-panel hisabi-floating-panel',
              panelClassName,
            )}
          >
            {showLoading ? (
              <div className="text-hisabi-outline flex items-center justify-center gap-2 p-hisabi-md type-body-sm">
                <HisabiSpinner size="inline" className="text-hisabi-teal" />
                {t('searchLoading')}
              </div>
            ) : null}

            {!showLoading && error ? (
              <p className="text-hisabi-outline p-hisabi-md text-center type-body-sm">
                {error}
              </p>
            ) : null}

            {!showLoading && !error && results && totalHits === 0 ? (
              <p className="text-hisabi-outline p-hisabi-md text-center type-body-sm">
                {t('searchNoResults')}
              </p>
            ) : null}

            {!showLoading &&
              !error &&
              visibleGroups.map((group) => (
                <div key={group.key}>
                  <div className="hisabi-global-search-group-label">
                    {group.label}
                  </div>
                  <ul>
                    {group.items.map((item) => (
                      <li
                        key={`${group.key}-${item.id}`}
                        role="option"
                        aria-selected="false"
                      >
                        <button
                          type="button"
                          className="hisabi-global-search-row"
                          onClick={() => handleSelect(item.href)}
                        >
                          <span className="type-body-sm truncate font-medium text-hisabi-on-surface">
                            {item.title}
                          </span>
                          {item.subtitle ? (
                            <span className="type-body-sm text-hisabi-outline truncate">
                              {item.subtitle}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>,
          document.body,
        )
      : null

  return (
    <div
      ref={rootRef}
      className={cn('hisabi-global-search', className)}
      role="combobox"
      aria-expanded={showPanel}
      aria-haspopup="listbox"
      aria-controls={listboxId}
    >
      <Search
        className="text-hisabi-outline pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2"
        aria-hidden
      />
      <input
        ref={inputRef}
        type="search"
        value={query}
        disabled={disabled}
        autoComplete="off"
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-label={t('searchPlaceholder')}
        placeholder={t('searchPlaceholder')}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => {
          if (active) setOpen(true)
        }}
        className={cn(inputClassName, disabled && 'cursor-not-allowed opacity-50')}
      />
      {panel}
    </div>
  )
}
