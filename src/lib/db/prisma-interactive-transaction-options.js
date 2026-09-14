/**
 * Prisma interactive transaction limits for multi-step server flows.
 * The default 5s timeout is too low for remote DBs plus activity logging.
 */
export const PRISMA_INTERACTIVE_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 30_000,
}
