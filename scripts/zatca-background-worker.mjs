/**
 * Polls Postgres for pending / ~23h-failed invoices and reports them to ZATCA.
 * Usage: bun scripts/zatca-background-worker.mjs
 *
 * No Redis — DB-backed queue (aligned with Step 18 removing BullMQ).
 */
import 'dotenv/config'

const POLL_MS = Number(process.env.ZATCA_WORKER_POLL_MS || 60_000)

async function tick() {
  const { processZatcaQueueGlobal } = await import(
    '../src/lib/zatca/run-zatca-background-report.js'
  )
  const result = await processZatcaQueueGlobal()
  if (result.processed > 0) {
    console.info(
      `[zatca-worker] businesses=${result.businesses} processed=${result.processed} reported=${result.reported} failed=${result.failed}`,
    )
  }
}

async function main() {
  console.info(
    `[zatca-worker] starting (poll ${POLL_MS}ms). Ctrl+C to stop.`,
  )
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await tick()
    } catch (err) {
      console.error('[zatca-worker] tick failed', err)
    }
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
}

main().catch((err) => {
  console.error('[zatca-worker] fatal', err)
  process.exit(1)
})
