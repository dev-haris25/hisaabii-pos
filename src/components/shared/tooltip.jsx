'use client'

import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

import { cn } from '@/lib/utils'

/** Viewport edge padding (px) used when clamping the tooltip horizontally. */
const VIEWPORT_PAD = 8

/**
 * Shared accessible tooltip (rules §13). Wraps a single focusable child.
 *
 * - Opens on pointer hover and on keyboard focus (`:focus-visible`).
 * - Closes on mouse leave, blur, pointer down and Escape.
 * - Renders `role="tooltip"` in a portal (escapes table `overflow` clipping) and links it
 *   to the trigger with `aria-describedby` while open.
 * - Position is passed to the design-system class via CSS custom properties set from a ref
 *   (no inline style props); it flips below the trigger when there is no room above.
 *
 * @param {{
 *   content: import('react').ReactNode
 *   children: import('react').ReactElement
 *   className?: string
 *   triggerClassName?: string
 *   disabled?: boolean
 * }} props
 */
export function Tooltip({ content, children, className, triggerClassName, disabled = false }) {
  const id = useId()
  const triggerRef = useRef(null)
  const tooltipRef = useRef(null)
  const [open, setOpen] = useState(false)

  const show = useCallback(() => {
    if (!disabled) setOpen(true)
  }, [disabled])
  const hide = useCallback(() => setOpen(false), [])

  const isOpen = open && !disabled && content != null && content !== ''

  useLayoutEffect(() => {
    if (!isOpen) return
    const trigger = triggerRef.current
    const tip = tooltipRef.current
    if (!trigger || !tip) return

    const rect = trigger.getBoundingClientRect()
    const tipRect = tip.getBoundingClientRect()
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth
    const half = tipRect.width / 2
    const center = rect.left + rect.width / 2
    const x = Math.min(
      Math.max(center, half + VIEWPORT_PAD),
      Math.max(half + VIEWPORT_PAD, viewportWidth - half - VIEWPORT_PAD),
    )
    const fitsAbove = rect.top - tipRect.height - VIEWPORT_PAD > 0
    const side = fitsAbove ? 'top' : 'bottom'

    tip.dataset.side = side
    tip.style.setProperty('--hisabi-tooltip-x', `${x}px`)
    tip.style.setProperty('--hisabi-tooltip-y', `${side === 'top' ? rect.top : rect.bottom}px`)
  }, [isOpen, content])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onScroll = () => setOpen(false)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [isOpen])

  const onFocus = (event) => {
    let keyboard = true
    try {
      keyboard = event.target.matches(':focus-visible')
    } catch {
      keyboard = true
    }
    if (keyboard) show()
  }

  const child = Children.only(children)
  const trigger = isValidElement(child)
    ? cloneElement(child, {
        'aria-describedby': isOpen
          ? [child.props['aria-describedby'], id].filter(Boolean).join(' ')
          : child.props['aria-describedby'],
      })
    : child

  return (
    <span
      ref={triggerRef}
      className={cn('hisabi-tooltip-trigger', triggerClassName)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={onFocus}
      onBlur={hide}
      onPointerDown={hide}
    >
      {trigger}
      {isOpen
        ? createPortal(
            <span
              ref={tooltipRef}
              id={id}
              role="tooltip"
              data-side="top"
              className={cn('hisabi-tooltip', className)}
            >
              {content}
            </span>,
            document.body,
          )
        : null}
    </span>
  )
}
