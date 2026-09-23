import { z } from 'zod'

export const tillHeartbeatBodySchema = z.object({
  tillId: z.string().trim().min(1).max(64),
  pendingUploadCount: z.number().int().nonnegative().optional(),
})
