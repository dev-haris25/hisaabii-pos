/**
 * Local SQLite schema v1 — empty shell ready for cloud sync (Step 3+).
 * No ZATCA private keys here (safeStorage later).
 *
 * @param {import('better-sqlite3').Database} db
 */
function applyInitialSchema(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      business_profile_id TEXT,
      pull_cursor TEXT,
      offline_ready INTEGER NOT NULL DEFAULT 0,
      last_full_sync_at TEXT,
      last_pull_at TEXT,
      last_push_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO sync_state (id, offline_ready) VALUES (1, 0);

    CREATE TABLE IF NOT EXISTS outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      synced_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_outbox_unsynced
      ON outbox (synced_at, id);

    -- Auth (password hashes synced later; never store CSID secrets here)
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT,
      password_hash TEXT,
      active_business_profile_id TEXT,
      updated_at TEXT,
      payload_json TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email);

    CREATE TABLE IF NOT EXISTS memberships (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      business_profile_id TEXT NOT NULL,
      updated_at TEXT,
      payload_json TEXT,
      UNIQUE (user_id, business_profile_id)
    );

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      business_profile_id TEXT NOT NULL,
      key TEXT,
      name TEXT,
      updated_at TEXT,
      payload_json TEXT
    );

    CREATE TABLE IF NOT EXISTS employee_roles (
      membership_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      PRIMARY KEY (membership_id, role_id)
    );

    -- Restaurant / settings / tills
    CREATE TABLE IF NOT EXISTS business_profiles (
      id TEXT PRIMARY KEY,
      primary_pos_till_id TEXT,
      updated_at TEXT,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS business_settings (
      business_profile_id TEXT PRIMARY KEY,
      updated_at TEXT,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pos_tills (
      id TEXT PRIMARY KEY,
      business_profile_id TEXT NOT NULL,
      name TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT,
      payload_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pos_tills_biz ON pos_tills (business_profile_id);

    -- Menu catalog
    CREATE TABLE IF NOT EXISTS menu_categories (
      id TEXT PRIMARY KEY,
      business_profile_id TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      updated_at TEXT,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id TEXT PRIMARY KEY,
      business_profile_id TEXT NOT NULL,
      category_id TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT,
      payload_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_menu_items_biz ON menu_items (business_profile_id);

    CREATE TABLE IF NOT EXISTS menu_item_variants (
      id TEXT PRIMARY KEY,
      menu_item_id TEXT NOT NULL,
      updated_at TEXT,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS menu_item_customizations (
      id TEXT PRIMARY KEY,
      menu_item_id TEXT NOT NULL,
      updated_at TEXT,
      payload_json TEXT NOT NULL
    );

    -- Sales
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      business_profile_id TEXT NOT NULL,
      invoice_number TEXT,
      zatca_status TEXT,
      local_only INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT,
      payload_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_invoices_biz ON invoices (business_profile_id);

    CREATE TABLE IF NOT EXISTS invoice_lines (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines (invoice_id);

    -- Kitchen
    CREATE TABLE IF NOT EXISTS kitchen_orders (
      id TEXT PRIMARY KEY,
      business_profile_id TEXT NOT NULL,
      status TEXT,
      updated_at TEXT,
      payload_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_kitchen_orders_biz ON kitchen_orders (business_profile_id);

    -- Stock
    CREATE TABLE IF NOT EXISTS stock_items (
      id TEXT PRIMARY KEY,
      business_profile_id TEXT NOT NULL,
      updated_at TEXT,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      business_profile_id TEXT NOT NULL,
      stock_item_id TEXT,
      created_at TEXT,
      payload_json TEXT NOT NULL
    );

    -- ZATCA tip metadata only (counter / last hash) — keys in Electron safeStorage
    CREATE TABLE IF NOT EXISTS zatca_device_tip (
      business_profile_id TEXT PRIMARY KEY,
      invoice_counter INTEGER NOT NULL DEFAULT 0,
      last_invoice_hash TEXT NOT NULL DEFAULT '',
      environment TEXT,
      updated_at TEXT,
      payload_json TEXT
    );
  `)
}

module.exports = { version: 1, applyInitialSchema }
