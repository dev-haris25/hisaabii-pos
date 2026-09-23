import { z } from 'zod'

const tipSchema = z
  .object({
    invoiceCounter: z.number().int().nonnegative().optional(),
    lastInvoiceHash: z.string().optional(),
  })
  .nullable()
  .optional()

const pushEventSchema = z.object({
  eventId: z.string().trim().min(1).max(128),
  eventType: z.string().trim().min(1).max(64),
  payload: z.any().optional(),
  invoice: z.any().optional(),
  lines: z.array(z.any()).optional(),
  kitchenOrder: z.any().optional(),
  movement: z.any().optional(),
  tip: tipSchema,
})

export const syncPushBodySchema = z.object({
  tillId: z.string().trim().min(1).max(64).optional().nullable(),
  pendingUploadCount: z.number().int().nonnegative().optional(),
  events: z.array(pushEventSchema).max(100),
})
