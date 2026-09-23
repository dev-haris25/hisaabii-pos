const version = 4

/**
 * Local-only flag: admin must unlock offline checkout on the primary till
 * for each outage. Resets when the till reconnects and finishes a sync.
 *
 * @param {import('better-sqlite3').Database} db
 */
function applyOfflineCheckoutUnlockSchema(db) {
  const cols = db.prepare(`PRAGMA table_info(sync_state)`).all()
  const has = cols.some((c) => c.name === 'offline_checkout_unlocked')
  if (!has) {
    db.exec(`
      ALTER TABLE sync_state ADD COLUMN offline_checkout_unlocked INTEGER NOT NULL DEFAULT 0;
    `)
  }
}

module.exports = { applyOfflineCheckoutUnlockSchema, version }
