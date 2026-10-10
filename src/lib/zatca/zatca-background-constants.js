/** ~23h after sale/failure — one automatic deadline retry (rules §19 / Step 9). */
export const ZATCA_DEADLINE_RETRY_MS = 23 * 60 * 60 * 1000

/** Max invoices processed per restaurant per worker tick. */
export const ZATCA_BACKGROUND_BATCH_PER_BUSINESS = 5

/** Max restaurants scanned per global worker tick. */
export const ZATCA_BACKGROUND_MAX_BUSINESSES = 40

/** Default poll interval for the PM2 worker. */
export const ZATCA_BACKGROUND_POLL_MS = 60_000

/**
 * Pending invoices younger than this are still owned by their checkout request;
 * the worker leaves them alone so it never reports the same sale concurrently.
 */
export const ZATCA_PENDING_MIN_AGE_MS = 5 * 60 * 1000
