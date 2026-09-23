const { getLocalDb, getLocalStatus } = require('../db/open-db.cjs')
const {
  verifyPassword,
  sha256Hex,
  signLocalToken,
  verifyLocalToken,
  randomTokenId,
} = require('./crypto.cjs')
const { getOfflineAuthSecret } = require('./offline-secret.cjs')

const SESSION_MAX_AGE_DEFAULT = 60 * 60 * 24 * 7
const SESSION_MAX_AGE_REMEMBER = 60 * 60 * 24 * 30

/**
 * @param {string} roleName
 * @param {boolean} isOwner
 */
function primaryRoleName(roleNames, isOwner) {
  if (isOwner) return 'Owner'
  if (!Array.isArray(roleNames) || roleNames.length === 0) return null
  if (roleNames.includes('Admin')) return 'Admin'
  return roleNames[0] ?? null
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} userId
 * @param {string} businessProfileId
 */
function buildAbilityRules(db, userId, businessProfileId) {
  const profile = db
    .prepare(`SELECT payload_json FROM business_profiles WHERE id = ?`)
    .get(businessProfileId)
  let ownerUserId = null
  try {
    ownerUserId = JSON.parse(profile?.payload_json || '{}')?.ownerUserId ?? null
  } catch {
    ownerUserId = null
  }

  if (ownerUserId && ownerUserId === userId) {
    return {
      abilityRules: [{ action: 'manage', subject: 'all' }],
      roleNames: [],
      roleName: 'Owner',
      isRestaurantOwner: true,
    }
  }

  const membership = db
    .prepare(
      `SELECT id FROM memberships WHERE user_id = ? AND business_profile_id = ?`,
    )
    .get(userId, businessProfileId)
  if (!membership) {
    return {
      abilityRules: [],
      roleNames: [],
      roleName: null,
      isRestaurantOwner: false,
    }
  }

  const roles = db
    .prepare(
      `SELECT r.id, r.name FROM roles r
       INNER JOIN employee_roles er ON er.role_id = r.id
       WHERE er.membership_id = ?`,
    )
    .all(membership.id)

  const roleNames = roles.map((r) => r.name).filter(Boolean)
  if (roleNames.includes('Admin')) {
    return {
      abilityRules: [{ action: 'manage', subject: 'all' }],
      roleNames,
      roleName: 'Admin',
      isRestaurantOwner: false,
    }
  }

  /** @type {Array<{ action: string, subject: string }>} */
  const abilityRules = []
  const seen = new Set()
  for (const role of roles) {
    const perms = db
      .prepare(
        `SELECT action, subject FROM role_permissions WHERE role_id = ?`,
      )
      .all(role.id)
    for (const p of perms) {
      const key = `${p.action}:${p.subject}`
      if (seen.has(key)) continue
      seen.add(key)
      abilityRules.push({ action: p.action, subject: p.subject })
    }
  }

  return {
    abilityRules,
    roleNames,
    roleName: primaryRoleName(roleNames, false),
    isRestaurantOwner: false,
  }
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} userId
 * @param {string} businessProfileId
 */
function buildOfflineAuthUser(db, userId, businessProfileId) {
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId)
  if (!user) return null

  let payload = {}
  try {
    payload = JSON.parse(user.payload_json || '{}')
  } catch {
    payload = {}
  }

  const memberships = db
    .prepare(
      `SELECT id, business_profile_id, payload_json FROM memberships WHERE user_id = ?`,
    )
    .all(userId)

  const profileRow = db
    .prepare(`SELECT * FROM business_profiles WHERE id = ?`)
    .get(businessProfileId)
  let profilePayload = {}
  try {
    profilePayload = JSON.parse(profileRow?.payload_json || '{}')
  } catch {
    profilePayload = {}
  }

  const zatca = db
    .prepare(`SELECT * FROM zatca_device_tip WHERE business_profile_id = ?`)
    .get(businessProfileId)

  const hasCompletedRestaurantOnboarding = Boolean(
    profilePayload.onboardingCompletedAt,
  )
  const hasProductionCsid = Boolean(
    zatca?.payload_json &&
      (() => {
        try {
          return JSON.parse(zatca.payload_json)?.productionCsid
        } catch {
          return null
        }
      })(),
  )
  const zatcaSkipped = profilePayload.zatcaOnboardingSkipped === true

  const rbac = buildAbilityRules(db, userId, businessProfileId)

  return {
    id: user.id,
    email: user.email,
    name: user.name || payload.name || '',
    preferredLocale: payload.preferredLocale ?? null,
    businessProfileId,
    hasBusinessProfile: hasCompletedRestaurantOnboarding,
    needsBusinessProfileOnboarding: !hasCompletedRestaurantOnboarding,
    needsZatcaOnboarding:
      hasCompletedRestaurantOnboarding && !hasProductionCsid && !zatcaSkipped,
    zatcaOnboardingSkippedEffective: zatcaSkipped,
    accessibleBusinessProfileCount: memberships.length,
    activeBusinessProfileId: hasCompletedRestaurantOnboarding
      ? businessProfileId
      : null,
    abilityRules: rbac.abilityRules,
    roleNames: rbac.roleNames,
    roleName: rbac.roleName,
    isRestaurantOwner: rbac.isRestaurantOwner,
    offlineSession: true,
  }
}

/**
 * @param {{ email: string, password: string, remember?: boolean }} input
 */
function localLogin(input) {
  const db = getLocalDb()
  const status = getLocalStatus()
  if (!status.offlineReady) {
    return {
      ok: false,
      status: 503,
      code: 'OFFLINE_NOT_READY',
      message: 'This till has not finished its first sync',
    }
  }
  const businessProfileId = status.businessProfileId
  if (!businessProfileId) {
    return {
      ok: false,
      status: 503,
      code: 'OFFLINE_NOT_READY',
      message: 'No restaurant synced on this till',
    }
  }

  const emailNorm = String(input.email || '')
    .trim()
    .toLowerCase()
  const password = String(input.password || '')
  if (!emailNorm || !password) {
    return {
      ok: false,
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid input',
    }
  }

  const user = db
    .prepare(`SELECT * FROM users WHERE lower(email) = ?`)
    .get(emailNorm)
  if (!user || !verifyPassword(password, user.password_hash || '')) {
    return {
      ok: false,
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password',
    }
  }

  let payload = {}
  try {
    payload = JSON.parse(user.payload_json || '{}')
  } catch {
    payload = {}
  }
  if (payload.active === false) {
    return {
      ok: false,
      status: 403,
      code: 'ACCOUNT_DISABLED',
      message: 'Account is disabled',
    }
  }
  if (payload.emailVerified === false) {
    return {
      ok: false,
      status: 403,
      code: 'EMAIL_NOT_VERIFIED',
      message: 'Verify your email first',
    }
  }

  const membership = db
    .prepare(
      `SELECT id FROM memberships WHERE user_id = ? AND business_profile_id = ?`,
    )
    .get(user.id, businessProfileId)
  if (!membership) {
    return {
      ok: false,
      status: 403,
      code: 'NO_RESTAURANT_ACCESS',
      message: 'No access to this restaurant on this till',
    }
  }

  const maxAge = input.remember
    ? SESSION_MAX_AGE_REMEMBER
    : SESSION_MAX_AGE_DEFAULT
  const exp = Math.floor(Date.now() / 1000) + maxAge
  const secret = getOfflineAuthSecret()
  const jti = randomTokenId()
  const token = signLocalToken(secret, {
    sub: user.id,
    bid: businessProfileId,
    exp,
    jti,
    offline: true,
  })

  const expiresAt = new Date(exp * 1000).toISOString()
  db.prepare(
    `INSERT INTO offline_sessions (token_hash, user_id, business_profile_id, expires_at)
     VALUES (?, ?, ?, ?)`,
  ).run(sha256Hex(token), user.id, businessProfileId, expiresAt)

  const authUser = buildOfflineAuthUser(db, user.id, businessProfileId)
  return { ok: true, user: authUser, token, offline: true }
}

/**
 * @param {string | null | undefined} token
 */
function localMe(token) {
  if (!token) {
    return { ok: false, status: 401, code: 'UNAUTHORIZED', message: 'Not signed in' }
  }
  const secret = getOfflineAuthSecret()
  const payload = verifyLocalToken(secret, token)
  if (!payload?.sub || !payload?.bid) {
    return { ok: false, status: 401, code: 'UNAUTHORIZED', message: 'Not signed in' }
  }

  const db = getLocalDb()
  const row = db
    .prepare(`SELECT * FROM offline_sessions WHERE token_hash = ?`)
    .get(sha256Hex(token))
  if (!row) {
    return { ok: false, status: 401, code: 'UNAUTHORIZED', message: 'Not signed in' }
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare(`DELETE FROM offline_sessions WHERE token_hash = ?`).run(
      sha256Hex(token),
    )
    return { ok: false, status: 401, code: 'UNAUTHORIZED', message: 'Not signed in' }
  }

  const user = buildOfflineAuthUser(db, String(payload.sub), String(payload.bid))
  if (!user) {
    return { ok: false, status: 401, code: 'UNAUTHORIZED', message: 'Not signed in' }
  }
  return { ok: true, user }
}

/**
 * @param {string | null | undefined} token
 */
function localLogout(token) {
  if (!token) return { ok: true }
  const db = getLocalDb()
  db.prepare(`DELETE FROM offline_sessions WHERE token_hash = ?`).run(
    sha256Hex(token),
  )
  return { ok: true }
}

/**
 * Refresh a user row after successful cloud login (keeps offline password current).
 * @param {Record<string, unknown>} userRow
 */
function upsertLocalUserFromCloud(userRow) {
  const db = getLocalDb()
  const id = String(userRow.id || '')
  const email = String(userRow.email || '').toLowerCase()
  if (!id || !email) return { ok: false }
  db.prepare(
    `INSERT INTO users (id, email, name, password_hash, active_business_profile_id, updated_at, payload_json)
     VALUES (@id, @email, @name, @password_hash, @active_business_profile_id, @updated_at, @payload_json)
     ON CONFLICT(id) DO UPDATE SET
       email = excluded.email,
       name = COALESCE(excluded.name, users.name),
       password_hash = COALESCE(excluded.password_hash, users.password_hash),
       active_business_profile_id = excluded.active_business_profile_id,
       updated_at = excluded.updated_at,
       payload_json = excluded.payload_json`,
  ).run({
    id,
    email,
    name: userRow.name != null ? String(userRow.name) : null,
    password_hash:
      typeof userRow.passwordHash === 'string' ? userRow.passwordHash : null,
    active_business_profile_id:
      userRow.activeBusinessProfileId != null
        ? String(userRow.activeBusinessProfileId)
        : null,
    updated_at: new Date().toISOString(),
    payload_json: JSON.stringify({
      id,
      email,
      name: userRow.name,
      active: userRow.active !== false,
      emailVerified: userRow.emailVerified !== false,
      preferredLocale: userRow.preferredLocale ?? null,
    }),
  })
  return { ok: true }
}

/**
 * After cloud login, mint a local session so checkout works if the network drops.
 * @param {string} userId
 * @param {{ remember?: boolean }} [opts]
 */
function mintOfflineSessionForUser(userId, opts = {}) {
  const id = String(userId || '').trim()
  if (!id) return { ok: false, code: 'VALIDATION_ERROR', message: 'userId required' }

  const db = getLocalDb()
  const status = getLocalStatus()
  const businessProfileId = status.businessProfileId
  if (!businessProfileId) {
    return { ok: false, code: 'OFFLINE_NOT_READY', message: 'Till not synced' }
  }

  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id)
  if (!user) {
    return { ok: false, code: 'USER_NOT_FOUND', message: 'User not synced locally' }
  }

  const membership = db
    .prepare(
      `SELECT id FROM memberships WHERE user_id = ? AND business_profile_id = ?`,
    )
    .get(id, businessProfileId)
  if (!membership) {
    return {
      ok: false,
      code: 'NO_RESTAURANT_ACCESS',
      message: 'No access to this restaurant on this till',
    }
  }

  const maxAge = opts.remember ? SESSION_MAX_AGE_REMEMBER : SESSION_MAX_AGE_DEFAULT
  const exp = Math.floor(Date.now() / 1000) + maxAge
  const secret = getOfflineAuthSecret()
  const jti = randomTokenId()
  const token = signLocalToken(secret, {
    sub: id,
    bid: businessProfileId,
    exp,
    jti,
    offline: true,
  })

  const expiresAt = new Date(exp * 1000).toISOString()
  db.prepare(
    `INSERT INTO offline_sessions (token_hash, user_id, business_profile_id, expires_at)
     VALUES (?, ?, ?, ?)`,
  ).run(sha256Hex(token), id, businessProfileId, expiresAt)

  const authUser = buildOfflineAuthUser(db, id, businessProfileId)
  return { ok: true, user: authUser, token, offline: true }
}

module.exports = {
  localLogin,
  localMe,
  localLogout,
  upsertLocalUserFromCloud,
  mintOfflineSessionForUser,
  buildOfflineAuthUser,
}
