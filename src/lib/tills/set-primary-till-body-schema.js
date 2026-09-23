import { z } from 'zod'

export const setPrimaryTillBodySchema = z.object({
  tillId: z.string().trim().min(1).max(64),
})
