import { z } from 'zod'

export const idTypeUpsertBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
})
