/**
 * @param {{
 *   id: string
 *   name: string
 *   displayEnabled: boolean
 *   displayPort: string | null
 *   displayBaud: number
 *   displayProtocol: string
 *   drawerEnabled: boolean
 *   drawerPort: string | null
 *   drawerProtocol: string
 *   createdAt: Date
 *   updatedAt: Date
 * }} row
 */
export function mapTillToJson(row) {
  return {
    id: row.id,
    name: row.name,
    displayEnabled: row.displayEnabled === true,
    displayPort: row.displayPort ?? '',
    displayBaud: row.displayBaud ?? 9600,
    displayProtocol: row.displayProtocol || 'vfd_ascii',
    drawerEnabled: row.drawerEnabled === true,
    drawerPort: row.drawerPort ?? '',
    drawerProtocol: row.drawerProtocol || 'escpos_pulse',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
