import { z } from 'zod'

import { MAX_TILL_LAN_PRINTERS } from '@/lib/tills/till-printers'

const optionalPort = z.string().trim().max(80).optional().nullable()

const lanPrinterSchema = z.object({
  ip: z
    .string()
    .trim()
    .max(100)
    .regex(/^[0-9a-fA-F.:]+$|^$/),
  port: z.number().int().min(1).max(65535),
})

const usbPrinterSchema = z.object({
  id: z.string().trim().min(1).max(200),
  kind: z.enum(['serial', 'winprinter']),
  label: z.string().trim().max(200).optional(),
})

export const tillCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  displayEnabled: z.boolean().optional(),
  displayPort: optionalPort,
  displayBaud: z.number().int().min(1200).max(256000).optional(),
  displayProtocol: z.enum(['vfd_ascii']).optional(),
  drawerEnabled: z.boolean().optional(),
  drawerPort: optionalPort,
  drawerProtocol: z.enum(['escpos_pulse']).optional(),
  printVia: z.enum(['lan', 'usb']).optional(),
  lanPrinters: z.array(lanPrinterSchema).max(MAX_TILL_LAN_PRINTERS).optional(),
  usbPrinters: z.array(usbPrinterSchema).max(MAX_TILL_LAN_PRINTERS).optional(),
})

export const tillPatchSchema = tillCreateSchema.partial().refine(
  (b) => Object.keys(b).length > 0,
  { message: 'Provide at least one field' },
)
