/**
 * Production migrate helper.
 *
 * 1) Clears known failed migration rows in `_prisma_migrations`
 * 2) Removes stale migration folders left on the VPS when rsync ran without --delete
 *    (renamed migrations otherwise get re-applied after --rolled-back)
 * 3) Runs `prisma migrate deploy`
 */
import { rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

/**
 * Migrations that were renamed/reordered. Old folder names must never be applied.
 * POS has none yet — keep this list empty until a migration is renamed.
 */
const STALE_MIGRATION_FOLDERS = [];

function run(args, { allowFail = false } = {}) {
  console.info(`[prisma-migrate] bunx ${args.join(" ")}`);
  const result = spawnSync("bunx", args, {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  const code = result.status ?? 1;
  if (code !== 0 && !allowFail) {
    process.exit(code);
  }
  return code;
}

const migrationsRoot = join(process.cwd(), "prisma", "migrations");

for (const name of STALE_MIGRATION_FOLDERS) {
  // Ignore non-zero: migration may never have been recorded, or already resolved.
  run(["prisma", "migrate", "resolve", "--rolled-back", name], { allowFail: true });

  const stalePath = join(migrationsRoot, name);
  if (existsSync(stalePath)) {
    console.info(`[prisma-migrate] removing stale migration folder: ${name}`);
    rmSync(stalePath, { recursive: true, force: true });
  }
}

run(["prisma", "migrate", "deploy"]);
console.info("[prisma-migrate] deploy complete");
