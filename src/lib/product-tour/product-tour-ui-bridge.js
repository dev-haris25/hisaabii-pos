/**
 * Tiny bridge so the tour can open the restaurant switcher if needed.
 */

/** @type {null | (() => void)} */
let openSwitcher = null

/** @param {(() => void) | null} fn */
export function registerRestaurantSwitcherOpener(fn) {
  openSwitcher = fn
}

export function requestOpenRestaurantSwitcher() {
  openSwitcher?.()
}
