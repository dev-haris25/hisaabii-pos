const { getLocalDb, setOfflineReady } = require('../db/open-db.cjs')

/**
 * @param {unknown} value
 */
function json(value) {
  return JSON.stringify(value ?? null)
}

/**
 * Clear restaurant-scoped rows when switching active restaurant on this till.
 * @param {import('better-sqlite3').Database} db
 * @param {string} businessProfileId
 */
function clearRestaurantData(db, businessProfileId) {
  db.prepare(
    `DELETE FROM employee_roles WHERE membership_id IN (
       SELECT id FROM memberships WHERE business_profile_id = ?
     )`,
  ).run(businessProfileId)
  db.prepare(`DELETE FROM memberships WHERE business_profile_id = ?`).run(
    businessProfileId,
  )
  db.prepare(
    `DELETE FROM role_permissions WHERE role_id IN (
       SELECT id FROM roles WHERE business_profile_id = ?
     )`,
  ).run(businessProfileId)
  db.prepare(`DELETE FROM roles WHERE business_profile_id = ?`).run(
    businessProfileId,
  )
  db.prepare(
    `DELETE FROM menu_item_customizations WHERE menu_item_id IN (
       SELECT id FROM menu_items WHERE business_profile_id = ?
     )`,
  ).run(businessProfileId)
  db.prepare(
    `DELETE FROM menu_item_variants WHERE menu_item_id IN (
       SELECT id FROM menu_items WHERE business_profile_id = ?
     )`,
  ).run(businessProfileId)
  db.prepare(`DELETE FROM menu_items WHERE business_profile_id = ?`).run(
    businessProfileId,
  )
  db.prepare(`DELETE FROM menu_categories WHERE business_profile_id = ?`).run(
    businessProfileId,
  )
  db.prepare(
    `DELETE FROM invoice_lines WHERE invoice_id IN (
       SELECT id FROM invoices WHERE business_profile_id = ?
     )`,
  ).run(businessProfileId)
  db.prepare(`DELETE FROM invoices WHERE business_profile_id = ?`).run(
    businessProfileId,
  )
  db.prepare(`DELETE FROM kitchen_orders WHERE business_profile_id = ?`).run(
    businessProfileId,
  )
  db.prepare(`DELETE FROM kitchen_order_counters WHERE business_profile_id = ?`).run(
    businessProfileId,
  )
  db.prepare(`DELETE FROM invoice_counters WHERE business_profile_id = ?`).run(
    businessProfileId,
  )
  db.prepare(`DELETE FROM menu_item_recipes WHERE business_profile_id = ?`).run(
    businessProfileId,
  )
  db.prepare(`DELETE FROM stock_movements WHERE business_profile_id = ?`).run(
    businessProfileId,
  )
  db.prepare(`DELETE FROM stock_items WHERE business_profile_id = ?`).run(
    businessProfileId,
  )
  db.prepare(`DELETE FROM pos_tills WHERE business_profile_id = ?`).run(
    businessProfileId,
  )
  db.prepare(`DELETE FROM business_settings WHERE business_profile_id = ?`).run(
    businessProfileId,
  )
  db.prepare(`DELETE FROM zatca_device_tip WHERE business_profile_id = ?`).run(
    businessProfileId,
  )
  db.prepare(`DELETE FROM business_profiles WHERE id = ?`).run(businessProfileId)
}

/**
 * Apply one pull page into SQLite.
 *
 * @param {{
 *   businessProfileId: string
 *   entities?: Record<string, unknown>
 *   wipeRestaurant?: boolean
 * }} batch
 */
function applyPullBatch(batch) {
  const db = getLocalDb()
  const businessProfileId = String(batch.businessProfileId || '')
  if (!businessProfileId) {
    throw new Error('businessProfileId required')
  }

  const apply = db.transaction(() => {
    const state = db
      .prepare(`SELECT business_profile_id FROM sync_state WHERE id = 1`)
      .get()
    const prevBiz = state?.business_profile_id
    if (
      batch.wipeRestaurant ||
      (prevBiz && prevBiz !== businessProfileId)
    ) {
      if (prevBiz) clearRestaurantData(db, prevBiz)
      if (prevBiz !== businessProfileId) {
        clearRestaurantData(db, businessProfileId)
      }
      db.prepare(
        `UPDATE sync_state SET offline_ready = 0, business_profile_id = ?, updated_at = datetime('now') WHERE id = 1`,
      ).run(businessProfileId)
    } else if (!prevBiz) {
      db.prepare(
        `UPDATE sync_state SET business_profile_id = ?, updated_at = datetime('now') WHERE id = 1`,
      ).run(businessProfileId)
    }

    const entities = batch.entities && typeof batch.entities === 'object' ? batch.entities : {}

    if (entities.businessProfile) {
      const row = /** @type {any} */ (entities.businessProfile)
      db.prepare(
        `INSERT INTO business_profiles (id, primary_pos_till_id, updated_at, payload_json)
         VALUES (@id, @primary_pos_till_id, @updated_at, @payload_json)
         ON CONFLICT(id) DO UPDATE SET
           primary_pos_till_id = excluded.primary_pos_till_id,
           updated_at = excluded.updated_at,
           payload_json = excluded.payload_json`,
      ).run({
        id: row.id,
        primary_pos_till_id: row.primaryPosTillId ?? null,
        updated_at: row.updatedAt ?? null,
        payload_json: json(row.payload ?? row),
      })
    }

    if (entities.businessSettings) {
      const row = /** @type {any} */ (entities.businessSettings)
      db.prepare(
        `INSERT INTO business_settings (business_profile_id, updated_at, payload_json)
         VALUES (@business_profile_id, @updated_at, @payload_json)
         ON CONFLICT(business_profile_id) DO UPDATE SET
           updated_at = excluded.updated_at,
           payload_json = excluded.payload_json`,
      ).run({
        business_profile_id: row.businessProfileId,
        updated_at: row.updatedAt ?? null,
        payload_json: json(row.payload ?? row),
      })
    }

    if (Array.isArray(entities.tills)) {
      const upsert = db.prepare(
        `INSERT INTO pos_tills (id, business_profile_id, name, is_primary, updated_at, payload_json)
         VALUES (@id, @business_profile_id, @name, @is_primary, @updated_at, @payload_json)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           is_primary = excluded.is_primary,
           updated_at = excluded.updated_at,
           payload_json = excluded.payload_json`,
      )
      for (const row of entities.tills) {
        upsert.run({
          id: row.id,
          business_profile_id: row.businessProfileId,
          name: row.name ?? '',
          is_primary: row.isPrimary ? 1 : 0,
          updated_at: row.updatedAt ?? null,
          payload_json: json(row.payload ?? row),
        })
      }
    }

    if (entities.zatcaDeviceTip) {
      const row = /** @type {any} */ (entities.zatcaDeviceTip)
      db.prepare(
        `INSERT INTO zatca_device_tip (
           business_profile_id, invoice_counter, last_invoice_hash, environment, updated_at, payload_json
         ) VALUES (
           @business_profile_id, @invoice_counter, @last_invoice_hash, @environment, @updated_at, @payload_json
         )
         ON CONFLICT(business_profile_id) DO UPDATE SET
           invoice_counter = excluded.invoice_counter,
           last_invoice_hash = excluded.last_invoice_hash,
           environment = excluded.environment,
           updated_at = excluded.updated_at,
           payload_json = excluded.payload_json`,
      ).run({
        business_profile_id: row.businessProfileId,
        invoice_counter: Number(row.invoiceCounter) || 0,
        last_invoice_hash: row.lastInvoiceHash || '',
        environment: row.environment ?? null,
        updated_at: row.updatedAt ?? null,
        payload_json: json(row.payload ?? row),
      })
    }

    if (Array.isArray(entities.users)) {
      const upsert = db.prepare(
        `INSERT INTO users (id, email, name, password_hash, active_business_profile_id, updated_at, payload_json)
         VALUES (@id, @email, @name, @password_hash, @active_business_profile_id, @updated_at, @payload_json)
         ON CONFLICT(id) DO UPDATE SET
           email = excluded.email,
           name = excluded.name,
           password_hash = excluded.password_hash,
           active_business_profile_id = excluded.active_business_profile_id,
           updated_at = excluded.updated_at,
           payload_json = excluded.payload_json`,
      )
      for (const row of entities.users) {
        upsert.run({
          id: row.id,
          email: row.email,
          name: row.name ?? null,
          password_hash: row.passwordHash ?? null,
          active_business_profile_id: row.activeBusinessProfileId ?? null,
          updated_at: row.updatedAt ?? null,
          payload_json: json(row.payload ?? row),
        })
      }
    }

    if (Array.isArray(entities.roles)) {
      const upsert = db.prepare(
        `INSERT INTO roles (id, business_profile_id, key, name, updated_at, payload_json)
         VALUES (@id, @business_profile_id, @key, @name, @updated_at, @payload_json)
         ON CONFLICT(id) DO UPDATE SET
           key = excluded.key,
           name = excluded.name,
           updated_at = excluded.updated_at,
           payload_json = excluded.payload_json`,
      )
      for (const row of entities.roles) {
        upsert.run({
          id: row.id,
          business_profile_id: row.businessProfileId,
          key: row.key ?? row.name ?? null,
          name: row.name ?? null,
          updated_at: row.updatedAt ?? null,
          payload_json: json(row.payload ?? row),
        })
      }
    }

    if (Array.isArray(entities.rolePermissions)) {
      const upsert = db.prepare(
        `INSERT INTO role_permissions (id, role_id, action, subject)
         VALUES (@id, @role_id, @action, @subject)
         ON CONFLICT(id) DO UPDATE SET
           role_id = excluded.role_id,
           action = excluded.action,
           subject = excluded.subject`,
      )
      for (const row of entities.rolePermissions) {
        upsert.run({
          id: row.id,
          role_id: row.roleId,
          action: row.action,
          subject: row.subject,
        })
      }
    }

    if (Array.isArray(entities.memberships)) {
      const upsert = db.prepare(
        `INSERT INTO memberships (id, user_id, business_profile_id, updated_at, payload_json)
         VALUES (@id, @user_id, @business_profile_id, @updated_at, @payload_json)
         ON CONFLICT(id) DO UPDATE SET
           user_id = excluded.user_id,
           business_profile_id = excluded.business_profile_id,
           updated_at = excluded.updated_at,
           payload_json = excluded.payload_json`,
      )
      for (const row of entities.memberships) {
        upsert.run({
          id: row.id,
          user_id: row.userId,
          business_profile_id: row.businessProfileId,
          updated_at: row.updatedAt ?? null,
          payload_json: json(row.payload ?? row),
        })
      }
    }

    if (Array.isArray(entities.employeeRoles)) {
      const del = db.prepare(`DELETE FROM employee_roles WHERE membership_id = ?`)
      const ins = db.prepare(
        `INSERT OR IGNORE INTO employee_roles (membership_id, role_id) VALUES (?, ?)`,
      )
      const seen = new Set()
      for (const row of entities.employeeRoles) {
        const mid = row.membershipId
        if (!seen.has(mid)) {
          del.run(mid)
          seen.add(mid)
        }
        ins.run(mid, row.roleId)
      }
    }

    if (Array.isArray(entities.menuCategories)) {
      const upsert = db.prepare(
        `INSERT INTO menu_categories (id, business_profile_id, sort_order, updated_at, payload_json)
         VALUES (@id, @business_profile_id, @sort_order, @updated_at, @payload_json)
         ON CONFLICT(id) DO UPDATE SET
           sort_order = excluded.sort_order,
           updated_at = excluded.updated_at,
           payload_json = excluded.payload_json`,
      )
      for (const row of entities.menuCategories) {
        upsert.run({
          id: row.id,
          business_profile_id: row.businessProfileId,
          sort_order: Number(row.sortOrder) || 0,
          updated_at: row.updatedAt ?? null,
          payload_json: json(row.payload ?? row),
        })
      }
    }

    if (Array.isArray(entities.menuItems)) {
      const upsert = db.prepare(
        `INSERT INTO menu_items (id, business_profile_id, category_id, active, updated_at, payload_json)
         VALUES (@id, @business_profile_id, @category_id, @active, @updated_at, @payload_json)
         ON CONFLICT(id) DO UPDATE SET
           category_id = excluded.category_id,
           active = excluded.active,
           updated_at = excluded.updated_at,
           payload_json = excluded.payload_json`,
      )
      for (const row of entities.menuItems) {
        upsert.run({
          id: row.id,
          business_profile_id: row.businessProfileId,
          category_id: row.categoryId ?? null,
          active: row.active === false ? 0 : 1,
          updated_at: row.updatedAt ?? null,
          payload_json: json(row.payload ?? row),
        })
      }
    }

    if (Array.isArray(entities.menuItemVariants)) {
      const upsert = db.prepare(
        `INSERT INTO menu_item_variants (id, menu_item_id, updated_at, payload_json)
         VALUES (@id, @menu_item_id, @updated_at, @payload_json)
         ON CONFLICT(id) DO UPDATE SET
           menu_item_id = excluded.menu_item_id,
           updated_at = excluded.updated_at,
           payload_json = excluded.payload_json`,
      )
      for (const row of entities.menuItemVariants) {
        upsert.run({
          id: row.id,
          menu_item_id: row.menuItemId,
          updated_at: row.updatedAt ?? null,
          payload_json: json(row.payload ?? row),
        })
      }
    }

    if (Array.isArray(entities.menuItemCustomizations)) {
      const upsert = db.prepare(
        `INSERT INTO menu_item_customizations (id, menu_item_id, updated_at, payload_json)
         VALUES (@id, @menu_item_id, @updated_at, @payload_json)
         ON CONFLICT(id) DO UPDATE SET
           menu_item_id = excluded.menu_item_id,
           updated_at = excluded.updated_at,
           payload_json = excluded.payload_json`,
      )
      for (const row of entities.menuItemCustomizations) {
        upsert.run({
          id: row.id,
          menu_item_id: row.menuItemId,
          updated_at: row.updatedAt ?? null,
          payload_json: json(row.payload ?? row),
        })
      }
    }

    if (Array.isArray(entities.menuItemRecipes)) {
      const upsert = db.prepare(
        `INSERT INTO menu_item_recipes (menu_item_id, business_profile_id, updated_at, payload_json)
         VALUES (@menu_item_id, @business_profile_id, @updated_at, @payload_json)
         ON CONFLICT(menu_item_id) DO UPDATE SET
           business_profile_id = excluded.business_profile_id,
           updated_at = excluded.updated_at,
           payload_json = excluded.payload_json`,
      )
      for (const row of entities.menuItemRecipes) {
        upsert.run({
          menu_item_id: row.menuItemId,
          business_profile_id: row.businessProfileId,
          updated_at: row.updatedAt ?? null,
          payload_json: json(row.payload ?? row),
        })
      }
    }

    if (entities.invoiceCounter && entities.invoiceCounter.businessProfileId) {
      const c = entities.invoiceCounter
      db.prepare(
        `INSERT INTO invoice_counters (business_profile_id, last_number)
         VALUES (?, ?)
         ON CONFLICT(business_profile_id) DO UPDATE SET
           last_number = CASE
             WHEN excluded.last_number > invoice_counters.last_number
             THEN excluded.last_number
             ELSE invoice_counters.last_number
           END`,
      ).run(c.businessProfileId, Number(c.lastNumber) || 0)
    }

    if (Array.isArray(entities.kitchenOrders)) {
      const selectExisting = db.prepare(
        `SELECT updated_at FROM kitchen_orders WHERE id = ?`,
      )
      const upsert = db.prepare(
        `INSERT INTO kitchen_orders (id, business_profile_id, status, updated_at, payload_json)
         VALUES (@id, @business_profile_id, @status, @updated_at, @payload_json)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status,
           updated_at = excluded.updated_at,
           payload_json = excluded.payload_json`,
      )
      for (const row of entities.kitchenOrders) {
        const incomingAt = row.updatedAt ?? null
        const existing = selectExisting.get(row.id)
        if (existing?.updated_at && incomingAt) {
          const localMs = Date.parse(String(existing.updated_at))
          const remoteMs = Date.parse(String(incomingAt))
          if (
            Number.isFinite(localMs) &&
            Number.isFinite(remoteMs) &&
            localMs > remoteMs
          ) {
            // Local write is newer (LWW) — keep local
            continue
          }
        }
        upsert.run({
          id: row.id,
          business_profile_id: row.businessProfileId,
          status: row.status ?? null,
          updated_at: incomingAt,
          payload_json: json(row.payload ?? row),
        })
      }
    }

    if (Array.isArray(entities.invoices)) {
      const upsertInv = db.prepare(
        `INSERT INTO invoices (id, business_profile_id, invoice_number, zatca_status, local_only, updated_at, payload_json)
         VALUES (@id, @business_profile_id, @invoice_number, @zatca_status, @local_only, @updated_at, @payload_json)
         ON CONFLICT(id) DO UPDATE SET
           invoice_number = excluded.invoice_number,
           zatca_status = excluded.zatca_status,
           updated_at = excluded.updated_at,
           payload_json = excluded.payload_json`,
      )
      const upsertLine = db.prepare(
        `INSERT INTO invoice_lines (id, invoice_id, payload_json)
         VALUES (@id, @invoice_id, @payload_json)
         ON CONFLICT(id) DO UPDATE SET
           invoice_id = excluded.invoice_id,
           payload_json = excluded.payload_json`,
      )
      for (const row of entities.invoices) {
        const payload = row.payload ?? row
        upsertInv.run({
          id: row.id,
          business_profile_id: row.businessProfileId,
          invoice_number: row.invoiceNumber ?? payload.invoiceNumber ?? null,
          zatca_status: row.zatcaStatus ?? payload.zatcaStatus ?? null,
          local_only: 0,
          updated_at: row.updatedAt ?? null,
          payload_json: json(payload),
        })
        const lines = Array.isArray(row.lines) ? row.lines : []
        for (const line of lines) {
          upsertLine.run({
            id: line.id,
            invoice_id: row.id,
            payload_json: json(line.payload ?? line),
          })
        }
      }
    }

    if (Array.isArray(entities.stockItems)) {
      const upsert = db.prepare(
        `INSERT INTO stock_items (id, business_profile_id, updated_at, payload_json)
         VALUES (@id, @business_profile_id, @updated_at, @payload_json)
         ON CONFLICT(id) DO UPDATE SET
           updated_at = excluded.updated_at,
           payload_json = excluded.payload_json`,
      )
      for (const row of entities.stockItems) {
        upsert.run({
          id: row.id,
          business_profile_id: row.businessProfileId,
          updated_at: row.updatedAt ?? null,
          payload_json: json(row.payload ?? row),
        })
      }
    }

    if (Array.isArray(entities.stockMovements)) {
      const upsert = db.prepare(
        `INSERT INTO stock_movements (id, business_profile_id, stock_item_id, created_at, payload_json)
         VALUES (@id, @business_profile_id, @stock_item_id, @created_at, @payload_json)
         ON CONFLICT(id) DO UPDATE SET
           stock_item_id = excluded.stock_item_id,
           created_at = excluded.created_at,
           payload_json = excluded.payload_json`,
      )
      for (const row of entities.stockMovements) {
        upsert.run({
          id: row.id,
          business_profile_id: row.businessProfileId,
          stock_item_id: row.stockItemId ?? null,
          created_at: row.createdAt ?? null,
          payload_json: json(row.payload ?? row),
        })
      }
    }
  })

  apply()
  return { ok: true }
}

/**
 * @param {{
 *   businessProfileId: string
 *   pullCursor: string | null
 * }} input
 */
function finalizeFullSync(input) {
  const db = getLocalDb()
  const businessProfileId = String(input.businessProfileId || '')
  const pullCursor = input.pullCursor ?? null
  db.prepare(
    `UPDATE sync_state SET
       business_profile_id = ?,
       pull_cursor = ?,
       offline_ready = 1,
       offline_checkout_unlocked = 0,
       last_full_sync_at = datetime('now'),
       last_pull_at = datetime('now'),
       updated_at = datetime('now')
     WHERE id = 1`,
  ).run(businessProfileId, pullCursor)
  setOfflineReady(true)
  return { ok: true, offlineReady: true }
}

/**
 * Incremental pull finished — update cursor, keep offlineReady.
 * Also clears the admin offline-checkout unlock so the next outage
 * requires a fresh unlock.
 * @param {{ pullCursor: string | null }} input
 */
function finalizeIncrementalSync(input) {
  const db = getLocalDb()
  db.prepare(
    `UPDATE sync_state SET
       pull_cursor = ?,
       offline_checkout_unlocked = 0,
       last_pull_at = datetime('now'),
       updated_at = datetime('now')
     WHERE id = 1`,
  ).run(input.pullCursor ?? null)
  return { ok: true }
}

module.exports = {
  applyPullBatch,
  finalizeFullSync,
  finalizeIncrementalSync,
  clearRestaurantData,
}
