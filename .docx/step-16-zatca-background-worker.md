# Step 16 — Background ZATCA reporting worker (plan Step 10)

## Summary
Crash-proof background reporting for invoices that fail ZATCA at checkout or stay unreported, plus a ~23-hour last-chance retry before ZATCA’s 24-hour window ends.

## Behavior
1. **Checkout** still tries ZATCA once (receipt QR requires success per rules.md #20).
2. On failure: invoice stays `failed`, attempt counters update, job enqueued to BullMQ (best-effort — Redis outage does not break checkout).
3. **Worker** (`bun run zatca-send-worker`):
   - Processes retry queue with concurrency 3
   - **Per-restaurant Redis lock** so hash chain / invoice counter never race (rules #18 / #24)
   - Bounded retries with exponential backoff
   - Idempotent skip if already `reported` / `cleared`
4. After retries exhausted: **in-app Notification** (deduped) + **admin email**
5. **Deadline sweep** every 15 minutes: invoices still `pending`/`failed` and older than **23 hours** get one more retry (`deadline_23h`) even if previously failed
6. If that last-chance retry fails: urgent email + notification warning that **~1 hour remains** of the 24-hour ZATCA constraint

## Schema
Migration `20260912180000_zatca_report_retry_tracking`:
- `zatcaReportAttempts`, `zatcaLastAttemptAt`, `zatcaLastError`, `zatcaDeadlineRetriedAt`

## Run locally
1. Redis on `REDIS_URL` (default `redis://127.0.0.1:6379`)
2. SMTP configured for failure emails
3. `bunx prisma migrate deploy`
4. `bunx prisma generate`
5. `bun run zatca-send-worker` (separate process from `bun dev`)

## Key files
- `scripts/zatca-send-worker.mjs`
- `src/bullmq/*`
- `src/lib/zatca/enqueue-invoice-zatca-retry.js`
- `src/lib/zatca/notify-zatca-report-failure.js`
- `src/lib/email/send-zatca-report-failed-email.js`
- `src/lib/pos/checkout-pos-sale.js` (enqueue on failure)
