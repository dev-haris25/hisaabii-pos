/** @param {unknown} v */
export function csvEscape(v) {
  const s = String(v ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/**
 * Export rows as CSV. Numbers should be passed as plain decimal strings (no locale formatting).
 *
 * @param {{
 *   filename: string
 *   columns: Array<{ key: string, header: string }>
 *   rows: Array<Record<string, unknown>>
 * }} params
 */
export function downloadReportCsv({ filename, columns, rows }) {
  const header = columns.map((c) => csvEscape(c.header)).join(',')
  const body = rows.map((row) =>
    columns.map((c) => csvEscape(row[c.key] ?? '')).join(','),
  )
  const blob = new Blob([[header, ...body].join('\n')], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
