import { z } from 'zod'

export const tableBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
})

export const tablePatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
  })
  .refine((d) => d.name !== undefined, {
    message: 'Provide at least one field',
  })
