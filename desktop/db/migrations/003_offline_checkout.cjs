/**
 * Local SQLite schema v3 — offline checkout counters + recipe cache.
 *
 * @param {import('better-sqlite3').Database} db
 */
function applyOfflineCheckoutSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoice_counters (
      business_profile_id TEXT PRIMARY KEY,
      last_number INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS kitchen_order_counters (
      business_profile_id TEXT NOT NULL,
      order_date TEXT NOT NULL,
      last_number INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (business_profile_id, order_date)
    );

    CREATE TABLE IF NOT EXISTS menu_item_recipes (
      menu_item_id TEXT PRIMARY KEY,
      business_profile_id TEXT NOT NULL,
      updated_at TEXT,
      payload_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_menu_item_recipes_biz
      ON menu_item_recipes (business_profile_id);
  `)
}

module.exports = { version: 3, applyOfflineCheckoutSchema }
