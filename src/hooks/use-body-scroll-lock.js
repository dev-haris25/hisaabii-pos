'use client'

import { useEffect } from 'react'

/**
 * Reference-counted lock so nested/overlapping sheets and modals (e.g. a confirm
 * modal opened from inside a sheet, or a sheet opened right after another one
 * closes) don't fight over `document.body.style.overflow`. Each caller "votes"
 * to lock; the body only unlocks once every voter has released its lock.
 */
let lockCount = 0
let previousOverflow = ''

function acquireLock() {
  if (lockCount === 0) {
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  lockCount += 1
}

function releaseLock() {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0) {
    document.body.style.overflow = previousOverflow
  }
}

/**
 * @param {boolean} active Whether this caller wants the body scroll locked.
 */
export function useBodyScrollLock(active) {
  useEffect(() => {
    if (!active) return
    acquireLock()
    return () => {
      releaseLock()
    }
  }, [active])
}
