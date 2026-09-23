const { mkdirSync } = require('node:fs')
const { join } = require('node:path')
const { runMigrations, getSchemaVersion, LATEST_VERSION } = require('./migrate.cjs')

/** @type {import('better-sqlite3').Database | null} */
let dbInstance = null
/** @type {string | null} */
let dbPathCached = null

/**
 * @param {string} userDataPath Electron app.getPath('userData')
 */
function openLocalDb(userDataPath) {
  if (dbInstance) return dbInstance

  const Database = require('better-sqlite3')
  const dir = join(userDataPath, 'local-db')
  mkdirSync(dir, { recursive: true })
  const dbPath = join(dir, 'hisabi-pos-local.sqlite')
  dbPathCached = dbPath

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  dbInstance = db
  return db
}

function getLocalDb() {
  if (!dbInstance) {
    throw new Error('Local DB not opened yet')
  }
  return dbInstance
}

function getDbPath() {
  return dbPathCached
}

/**
 * @returns {{
 *   offlineReady: boolean
 *   businessProfileId: string | null
 *   pullCursor: string | null
 *   lastFullSyncAt: string | null
 *   lastPullAt: string | null
 *   lastPushAt: string | null
 *   schemaVersion: number
 *   latestSchemaVersion: number
 *   dbPath: string | null
 *   pendingOutboxCount: number
 * }}
 */
function getLocalStatus() {
  const db = getLocalDb()
  const row = db
    .prepare(
      `SELECT business_profile_id, pull_cursor, offline_ready,
              last_full_sync_at, last_pull_at, last_push_at
       FROM sync_state WHERE id = 1`,
    )
    .get()
  const pending = db
    .prepare(`SELECT COUNT(*) AS c FROM outbox WHERE synced_at IS NULL`)
    .get()

  return {
    offlineReady: Boolean(row?.offline_ready),
    businessProfileId: row?.business_profile_id ?? null,
    pullCursor: row?.pull_cursor ?? null,
    lastFullSyncAt: row?.last_full_sync_at ?? null,
    lastPullAt: row?.last_pull_at ?? null,
    lastPushAt: row?.last_push_at ?? null,
    schemaVersion: getSchemaVersion(db),
    latestSchemaVersion: LATEST_VERSION,
    dbPath: dbPathCached,
    pendingOutboxCount: Number(pending?.c) || 0,
  }
}

/**
 * Step 3 will set this after full sync. Exposed for tests / future sync worker.
 * @param {boolean} ready
 */
function setOfflineReady(ready) {
  const db = getLocalDb()
  db.prepare(
    `UPDATE sync_state SET offline_ready = ?, updated_at = datetime('now') WHERE id = 1`,
  ).run(ready ? 1 : 0)
}

function closeLocalDb() {
  if (dbInstance) {
    try {
      dbInstance.close()
    } catch {
      /* ignore */
    }
    dbInstance = null
  }
}

module.exports = {
  openLocalDb,
  getLocalDb,
  getDbPath,
  getLocalStatus,
  setOfflineReady,
  closeLocalDb,
}
