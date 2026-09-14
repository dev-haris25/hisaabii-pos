/**
 * Drop all data and reapply Prisma migrations (destructive).
 *
 * Requires explicit confirmation:
 *   HISABI_CONFIRM_DB_RESET=yes
 *   PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=yes
 *
 * Used manually on the VPS:
 *   HISABI_CONFIRM_DB_RESET=yes PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=yes bun run db:reset
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";

function maskDatabaseUrl(url) {
  return url.replace(/:([^:@/]+)@/, ":***@");
}

if (process.env.HISABI_CONFIRM_DB_RESET !== "yes") {
  console.error(
    "[prisma-reset] Refusing to run. Set HISABI_CONFIRM_DB_RESET=yes to confirm.",
  );
  process.exit(1);
}

if (process.env.PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION !== "yes") {
  console.error(
    "[prisma-reset] Refusing to run. Set PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=yes to confirm.",
  );
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL || process.env.DIRECT_URL || "";
if (!databaseUrl) {
  console.error("[prisma-reset] DATABASE_URL (or DIRECT_URL) is not set.");
  process.exit(1);
}

console.info("[prisma-reset] Wiping database and reapplying migrations");
console.info(`[prisma-reset] Target: ${maskDatabaseUrl(databaseUrl)}`);

const result = spawnSync("bunx", ["prisma", "migrate", "reset", "--force"], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "yes",
  },
});

const code = result.status ?? 1;
if (code === 0) {
  console.info("[prisma-reset] complete");
}
process.exit(code);
