/**
 * Ensures electron-builder `files` still lists every runtime folder the
 * local API / offline checkout needs. Run: bun run smoke:packaging (from desktop/).
 */
const { existsSync } = require('node:fs')
const { join } = require('node:path')

const root = join(__dirname, '..')
const required = [
  'main.cjs',
  'preload.cjs',
  'app-config.json',
  'db/open-db.cjs',
  'local-api/server.cjs',
  'sync/apply-pull.cjs',
  'sync/zatca-secrets-store.cjs',
  'auth/local-login.cjs',
  'pos/local-checkout.cjs',
  'stock/local-stock.cjs',
  'catalog/local-catalog-read.cjs',
  'zatca/sign-offline.cjs',
]

let failed = 0
for (const rel of required) {
  const abs = join(root, rel)
  if (!existsSync(abs)) {
    console.error(`[smoke:packaging] MISSING ${rel}`)
    failed += 1
  } else {
    console.info(`[smoke:packaging] ok ${rel}`)
  }
}

const pkg = require('../package.json')
const files = pkg.build?.files || []
const mustInclude = [
  'pos/**/*',
  'stock/**/*',
  'catalog/**/*',
  'zatca/**/*',
  'db/**/*',
  'local-api/**/*',
  'offline-app/dist/**/*',
]
for (const pattern of mustInclude) {
  if (!files.includes(pattern)) {
    console.error(`[smoke:packaging] build.files missing ${pattern}`)
    failed += 1
  }
}

if (!pkg.dependencies?.['@talha7k/zatca']) {
  console.error('[smoke:packaging] missing dependency @talha7k/zatca')
  failed += 1
}
if (!pkg.dependencies?.['better-sqlite3']) {
  console.error('[smoke:packaging] missing dependency better-sqlite3')
  failed += 1
}

if (failed > 0) {
  console.error(`[smoke:packaging] FAILED (${failed})`)
  process.exit(1)
}
console.info('[smoke:packaging] PASSED')
