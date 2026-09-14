'use client'

import { ChevronDown, Plus } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { HisabiSpinner } from '@/components/hisabi-spinner'
import { cn } from '@/lib/utils'

/**
 * @typedef {{ id: string, label: string, sublabel?: string }} PickerItem
 */

/**
 * @param {PickerItem[]} items
 * @param {string} query
 */
function defaultFilterItems(items, query) {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter((item) => {
    const label = item.label.toLowerCase()
    const sub = String(item.sublabel ?? '').toLowerCase()
    return label.includes(q) || sub.includes(q)
  })
}

/**
 * Dropdown with built-in search (portal menu). Used for clients and products on invoices.
 *
 * @param {{
 *   items: PickerItem[]
 *   value: string
 *   onChange: (id: string) => void
 *   emptyLabel: string
 *   searchPlaceholder: string
 *   disabled?: boolean
 *   loading?: boolean
 *   triggerClassName?: string
 *   filterItems?: (items: PickerItem[], query: string) => PickerItem[]
 *   portal?: boolean
 *   footerAction?: { label: string, onSelect: () => void } | null
 * }} props
 */
export function SearchableEntityPicker({
  items,
  value,
  onChange,
  emptyLabel,
  searchPlaceholder,
  disabled = false,
  loading = false,
  triggerClassName,
  filterItems = defaultFilterItems,
  portal = true,
  footerAction = null,
}) {
  const listboxId = useId()
  const searchInputId = useId()
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [menuRect, setMenuRect] = useState(/** @type {DOMRect | null} */ (null))
  const buttonRef = useRef(/** @type {HTMLButtonElement | null} */ (null))
  const menuRef = useRef(/** @type {HTMLUListElement | null} */ (null))
  const panelRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const searchInputRef = useRef(/** @type {HTMLInputElement | null} */ (null))
  const rootRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const mountedRef = useRef(false)
  const [portalReady, setPortalReady] = useState(false)

  const selected = items.find((item) => item.id === value)

  useEffect(() => {
    mountedRef.current = true
    setPortalReady(true)
    return () => {
      mountedRef.current = false
      setPortalReady(false)
    }
  }, [])

  const filteredItems = useMemo(
    () => filterItems(items, searchQuery),
    [items, searchQuery, filterItems],
  )

  useLayoutEffect(() => {
    if (!open || !portal) return
    const el = buttonRef.current
    if (!el) return
    function update() {
      if (!mountedRef.current) return
      const r = buttonRef.current?.getBoundingClientRect()
      if (r) setMenuRect(r)
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const raf = requestAnimationFrame(() => {
      if (!mountedRef.current) return
      searchInputRef.current?.focus()
    })
    return () => cancelAnimationFrame(raf)
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape' && mountedRef.current) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (!open) return
    function onPointerDown(e) {
      const t = /** @type {Node | null} */ (e.target)
      if (rootRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      if (mountedRef.current) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const maxMenuHeight =
    menuRect != null && typeof window !== 'undefined'
      ? Math.max(120, window.innerHeight - menuRect.bottom - 12)
      : 240

  const inlineListMaxHeight = 180
  const footerReserve = footerAction?.label ? 64 : 0
  const panelMaxHeight = portal
    ? Math.min(320, Math.max(140, maxMenuHeight))
    : 240
  const listMaxHeight = portal
    ? Math.max(96, panelMaxHeight - 58 - footerReserve)
    : inlineListMaxHeight

  const panelFixedStyle =
    !portal
      ? undefined
      : menuRect == null
        ? { display: 'none' }
        : (() => {
            const triggerW = menuRect.width
            const panelWidth = Math.max(triggerW, 280)
            let left = menuRect.left
            if (typeof window !== 'undefined') {
              const pad = 8
              const maxLeft = window.innerWidth - pad - panelWidth
              if (left > maxLeft) left = Math.max(pad, maxLeft)
            }
            return {
              position: 'fixed',
              top: menuRect.bottom + 4,
              left,
              width: panelWidth,
              maxHeight: panelMaxHeight,
            }
          })()

  const listContent = (
    <div
      ref={panelRef}
      className={cn(
        'type-body-md text-hisabi-on-surface z-[200] flex flex-col overflow-hidden rounded-lg border border-hisabi-outline-variant bg-hisabi-surface-container-lowest shadow-xl',
        !portal && 'absolute start-0 top-[calc(100%+4px)] w-full max-h-[240px]',
      )}
      style={panelFixedStyle}
    >
      <div className="border-hisabi-outline-variant shrink-0 border-b bg-hisabi-surface-container-lowest px-hisabi-sm py-2">
        <label htmlFor={searchInputId} className="sr-only">
          {searchPlaceholder}
        </label>
        <input
          ref={searchInputRef}
          id={searchInputId}
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={searchPlaceholder}
          autoComplete="off"
          spellCheck={false}
          className="type-body-md w-full rounded-md border border-hisabi-outline-variant bg-hisabi-surface px-hisabi-sm py-2 text-hisabi-on-surface outline-none placeholder:text-hisabi-on-surface-variant focus:border-hisabi-primary"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              setOpen(false)
            }
          }}
        />
      </div>
      <ul
        ref={menuRef}
        id={listboxId}
        role="listbox"
        className="overflow-y-auto py-1"
        style={{ maxHeight: listMaxHeight }}
      >
        {loading ? (
          <li className="flex items-center justify-center px-hisabi-md py-6">
            <HisabiSpinner className="text-hisabi-primary" />
          </li>
        ) : filteredItems.length === 0 ? (
          <li className="type-body-sm text-hisabi-on-surface-variant px-hisabi-md py-3 text-center">
            —
          </li>
        ) : (
          filteredItems.map((item) => (
            <li key={item.id} role="none">
              <button
                type="button"
                role="option"
                aria-selected={value === item.id}
                className={cn(
                  'flex w-full flex-col gap-0.5 px-hisabi-md py-2.5 text-start',
                  value === item.id
                    ? 'bg-hisabi-primary-container/15'
                    : 'hover:bg-hisabi-surface-container-low',
                )}
                onClick={() => {
                  onChange(item.id)
                  setOpen(false)
                }}
              >
                <span className="type-body-sm font-semibold text-hisabi-on-surface">
                  {item.label}
                </span>
                {item.sublabel ? (
                  <span className="type-body-sm text-hisabi-on-surface-variant" dir="ltr">
                    {item.sublabel}
                  </span>
                ) : null}
              </button>
            </li>
          ))
        )}
      </ul>
      {footerAction?.label ? (
        <div className="border-hisabi-outline-variant shrink-0 border-t bg-hisabi-surface-container-lowest p-hisabi-sm">
          <button
            type="button"
            className="type-label-md text-hisabi-primary hover:bg-hisabi-surface-container-low flex w-full cursor-pointer items-center justify-center gap-hisabi-sm rounded-lg border border-hisabi-outline-variant bg-hisabi-surface-container-lowest px-hisabi-md py-2.5 font-semibold transition-colors"
            onClick={() => {
              setOpen(false)
              footerAction.onSelect()
            }}
          >
            <Plus className="size-4 shrink-0" aria-hidden />
            {footerAction.label}
          </button>
        </div>
      ) : null}
    </div>
  )

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => {
          if (disabled) return
          setOpen((wasOpen) => {
            if (!wasOpen) setSearchQuery('')
            return !wasOpen
          })
        }}
        className={cn(
          'type-body-md flex min-h-[2.75rem] w-full cursor-pointer items-center justify-between gap-hisabi-sm rounded-lg border border-hisabi-outline-variant bg-hisabi-surface px-hisabi-md py-2.5 text-start transition-colors',
          'hover:border-hisabi-outline focus:border-hisabi-primary focus:ring-2 focus:ring-hisabi-primary/10',
          'disabled:cursor-not-allowed disabled:opacity-50',
          triggerClassName,
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          {selected ? (
            <span className="text-hisabi-on-surface">{selected.label}</span>
          ) : (
            <span className="text-hisabi-outline/70">{emptyLabel}</span>
          )}
        </span>
        <ChevronDown
          className={cn(
            'text-hisabi-outline size-5 shrink-0 transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>
      {portal
        ? portalReady && open && menuRect && typeof document !== 'undefined'
          ? createPortal(listContent, document.body)
          : null
        : open
          ? listContent
          : null}
    </div>
  )
}
