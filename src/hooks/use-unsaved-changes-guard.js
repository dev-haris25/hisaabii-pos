'use client'

import { useCallback, useEffect, useRef } from 'react'

/**
 * @typedef {{ kind: 'href', href: string } | { kind: 'back' }} UnsavedLeaveTarget
 */

/**
 * Blocks in-app link clicks, browser back, and tab close/refresh while dirty.
 *
 * @param {{
 *   isDirty: boolean
 *   enabled?: boolean
 *   onBlock: (target: UnsavedLeaveTarget) => void
 * }} options
 */
export function useUnsavedChangesGuard({ isDirty, enabled = true, onBlock }) {
  const bypassRef = useRef(false)
  const armedHistoryRef = useRef(false)
  const onBlockRef = useRef(onBlock)
  onBlockRef.current = onBlock

  const allowNextNavigation = useCallback(() => {
    bypassRef.current = true
  }, [])

  useEffect(() => {
    if (!enabled || !isDirty) return undefined

    function onBeforeUnload(e) {
      if (bypassRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [enabled, isDirty])

  useEffect(() => {
    if (!enabled || !isDirty) {
      armedHistoryRef.current = false
      return undefined
    }

    function onDocumentClick(e) {
      if (bypassRef.current) return
      if (e.defaultPrevented) return
      if (e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return

      const anchor = /** @type {HTMLElement | null} */ (e.target)?.closest?.(
        'a[href]',
      )
      if (!anchor || !(anchor instanceof HTMLAnchorElement)) return
      if (anchor.target === '_blank' || anchor.hasAttribute('download')) return

      const hrefAttr = anchor.getAttribute('href')
      if (!hrefAttr || hrefAttr.startsWith('#')) return
      if (
        hrefAttr.startsWith('mailto:') ||
        hrefAttr.startsWith('tel:') ||
        hrefAttr.startsWith('javascript:')
      ) {
        return
      }

      let url
      try {
        url = new URL(anchor.href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return

      const nextPath = `${url.pathname}${url.search}${url.hash}`
      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
      if (nextPath === currentPath) return

      e.preventDefault()
      e.stopPropagation()
      onBlockRef.current({ kind: 'href', href: nextPath })
    }

    document.addEventListener('click', onDocumentClick, true)
    return () => document.removeEventListener('click', onDocumentClick, true)
  }, [enabled, isDirty])

  useEffect(() => {
    if (!enabled || !isDirty) {
      armedHistoryRef.current = false
      return undefined
    }

    if (!armedHistoryRef.current) {
      window.history.pushState({ __hisabiUnsavedGuard: true }, '', window.location.href)
      armedHistoryRef.current = true
    }

    function onPopState() {
      if (bypassRef.current) return
      window.history.pushState(
        { __hisabiUnsavedGuard: true },
        '',
        window.location.href,
      )
      onBlockRef.current({ kind: 'back' })
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [enabled, isDirty])

  /**
   * @param {UnsavedLeaveTarget} target
   */
  const proceed = useCallback((target) => {
    bypassRef.current = true
    armedHistoryRef.current = false
    if (target.kind === 'back') {
      window.history.go(-2)
      return
    }
    window.location.assign(target.href)
  }, [])

  return { allowNextNavigation, proceed }
}
