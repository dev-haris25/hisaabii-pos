import { useCallback, useMemo, useState } from 'react'

/**
 * @param {unknown[]} pageRows
 * @param {{ getRowId?: (row: unknown) => string }} [options]
 */
export function useListRowSelection(pageRows, options = {}) {
  const getRowId =
    options.getRowId ?? ((/** @type {{ id?: string }} */ row) => row.id ?? '')
  const [selectedIds, setSelectedIds] = useState(
    /** @type {Set<string>} */ (new Set()),
  )

  const pageRowIds = useMemo(
    () => pageRows.map(getRowId).filter(Boolean),
    [pageRows, getRowId],
  )

  const allPageSelected =
    pageRowIds.length > 0 && pageRowIds.every((id) => selectedIds.has(id))
  const somePageSelected = pageRowIds.some((id) => selectedIds.has(id))

  const toggleRow = useCallback((/** @type {string} */ id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAllOnPage = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allPageSelected) {
        for (const id of pageRowIds) next.delete(id)
      } else {
        for (const id of pageRowIds) next.add(id)
      }
      return next
    })
  }, [allPageSelected, pageRowIds])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const isSelected = useCallback(
    (/** @type {string} */ id) => selectedIds.has(id),
    [selectedIds],
  )

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    allPageSelected,
    somePageSelected,
    toggleRow,
    toggleAllOnPage,
    clearSelection,
    isSelected,
  }
}
