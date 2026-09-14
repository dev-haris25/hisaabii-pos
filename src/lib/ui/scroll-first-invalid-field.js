/**
 * Scrolls the first invalid form control into view after validation fails.
 * Looks for `[aria-invalid="true"]`, then `.border-hisabi-error`.
 *
 * @param {ParentNode | null | undefined} [root]
 * @returns {boolean} whether a target was found and scrolled
 */
export function scrollFirstInvalidFieldIntoView(root) {
  if (typeof document === 'undefined') return false
  const scope = root instanceof Element || root instanceof Document ? root : document
  const el =
    scope.querySelector('[aria-invalid="true"]') ||
    scope.querySelector('.border-hisabi-error')
  if (!(el instanceof HTMLElement)) return false

  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLButtonElement
  ) {
    try {
      el.focus({ preventScroll: true })
    } catch {
      // ignore focus failures (e.g. disabled)
    }
  }
  return true
}

/**
 * Run after `setFieldErrors` so React can paint error borders first.
 * Matches add-client timing (`setTimeout(0)` + paint frames).
 *
 * @param {ParentNode | null | undefined} [root]
 */
export function scrollAfterFieldValidation(root) {
  if (typeof document === 'undefined') return
  window.setTimeout(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollFirstInvalidFieldIntoView(root)
      })
    })
  }, 0)
}
