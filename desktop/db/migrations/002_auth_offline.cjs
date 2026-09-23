/**
 * Step 4 — role permissions + offline sessions.
 * @param {import('better-sqlite3').Database} db
 */
function applyAuthOfflineSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      id TEXT PRIMARY KEY,
      role_id TEXT NOT NULL,
      action TEXT NOT NULL,
      subject TEXT NOT NULL,
      UNIQUE (role_id, action, subject)
    );

    CREATE INDEX IF NOT EXISTS idx_role_permissions_role
      ON role_permissions (role_id);

    CREATE TABLE IF NOT EXISTS offline_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      business_profile_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_offline_sessions_user
      ON offline_sessions (user_id);
  `)
}

module.exports = { version: 2, applyAuthOfflineSchema }
