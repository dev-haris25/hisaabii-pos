const { applyInitialSchema, version: V1 } = require('./migrations/001_initial.cjs')
const {
  applyAuthOfflineSchema,
  version: V2,
} = require('./migrations/002_auth_offline.cjs')
const {
  applyOfflineCheckoutSchema,
  version: V3,
} = require('./migrations/003_offline_checkout.cjs')
const {
  applyOfflineCheckoutUnlockSchema,
  version: V4,
} = require('./migrations/004_offline_checkout_unlock.cjs')

const MIGRATIONS = [
  { version: V1, apply: applyInitialSchema },
  { version: V2, apply: applyAuthOfflineSchema },
  { version: V3, apply: applyOfflineCheckoutSchema },
  { version: V4, apply: applyOfflineCheckoutUnlockSchema },
]

/**
 * @param {import('better-sqlite3').Database} db
 */
function getSchemaVersion(db) {
  const row = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'`,
    )
    .get()
  if (!row) return 0
  const ver = db
    .prepare(`SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations`)
    .get()
  return Number(ver?.v) || 0
}

/**
 * @param {import('better-sqlite3').Database} db
 */
function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  const current = getSchemaVersion(db)
  const insert = db.prepare(
    `INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)`,
  )

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue
    const apply = db.transaction(() => {
      migration.apply(db)
      insert.run(migration.version)
    })
    apply()
  }

  return getSchemaVersion(db)
}

module.exports = { runMigrations, getSchemaVersion, LATEST_VERSION: V4 }
