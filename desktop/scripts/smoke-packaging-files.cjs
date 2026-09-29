/**
 * Ensures electron-builder `files` still lists every runtime file the
 * online-only shell needs. Run: bun run smoke:packaging (from desktop/).
 */
const { existsSync } = require('node:fs')
const { join } = require('node:path')

const root = join(__dirname, '..')
const required = [
  'main.cjs',
  'preload.cjs',
  'app-config.json',
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
const mustInclude = ['main.cjs', 'preload.cjs', 'app-config.json', 'icon.png']
for (const pattern of mustInclude) {
  if (!files.includes(pattern)) {
    console.error(`[smoke:packaging] build.files missing ${pattern}`)
    failed += 1
  }
}

const mustNotInclude = [
  'db/**/*',
  'local-api/**/*',
  'sync/**/*',
  'auth/**/*',
  'pos/**/*',
  'stock/**/*',
  'catalog/**/*',
  'zatca/**/*',
  'offline-app/dist/**/*',
]
for (const pattern of mustNotInclude) {
  if (files.includes(pattern)) {
    console.error(`[smoke:packaging] build.files still includes offline ${pattern}`)
    failed += 1
  }
}

if (pkg.dependencies?.['@talha7k/zatca']) {
  console.error('[smoke:packaging] unexpected dependency @talha7k/zatca')
  failed += 1
}
if (pkg.dependencies?.['better-sqlite3']) {
  console.error('[smoke:packaging] unexpected dependency better-sqlite3')
  failed += 1
}
if (!pkg.dependencies?.serialport) {
  console.error('[smoke:packaging] missing dependency serialport')
  failed += 1
}
if (pkg.scripts?.['build:offline-app']) {
  console.error('[smoke:packaging] unexpected script build:offline-app')
  failed += 1
}

if (failed > 0) {
  console.error(`[smoke:packaging] FAILED (${failed})`)
  process.exit(1)
}
console.info('[smoke:packaging] PASSED')
