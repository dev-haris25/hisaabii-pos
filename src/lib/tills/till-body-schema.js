import { z } from 'zod'

const optionalPort = z
  .string()
  .trim()
  .max(80)
  .optional()
  .nullable()

export const tillCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  displayEnabled: z.boolean().optional(),
  displayPort: optionalPort,
  displayBaud: z.number().int().min(1200).max(256000).optional(),
  displayProtocol: z.enum(['vfd_ascii']).optional(),
  drawerEnabled: z.boolean().optional(),
  drawerPort: optionalPort,
  drawerProtocol: z.enum(['escpos_pulse']).optional(),
})

export const tillPatchSchema = tillCreateSchema.partial().refine(
  (b) => Object.keys(b).length > 0,
  { message: 'Provide at least one field' },
)
