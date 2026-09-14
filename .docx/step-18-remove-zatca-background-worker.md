# Step 18 — Remove background ZATCA reporting

## Decision
ZATCA reporting stays **checkout-only**. Background retry / deadline sweep is removed.

## Behavior
- Checkout still calls ZATCA once (required for Phase-2 QR / print).
- On failure: invoice is marked `failed`, last error stored, cashier sees `ZATCA_ERROR`.
- No Redis, no BullMQ worker, no retry enqueue, no failure-email worker.

## Removed
- `scripts/zatca-send-worker.mjs`
- `src/bullmq/*`
- `src/lib/zatca/enqueue-invoice-zatca-retry.js`
- `src/lib/zatca/zatca-retry-constants.js`
- `src/lib/zatca/notify-zatca-report-failure.js`
- `src/lib/email/send-zatca-report-failed-email.js`
- `REDIS_URL` / worker env
- `bullmq` and `ioredis` packages

## Notes
Invoice retry-tracking columns remain in the schema (from the earlier migration) but are only updated at checkout. No new migration was added.
