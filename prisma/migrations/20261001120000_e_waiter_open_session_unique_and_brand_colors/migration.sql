-- E-Waiter: at most one open TableSession per table; expand brand color columns.

-- Partial unique: one open session per table
CREATE UNIQUE INDEX "table_sessions_one_open_per_table_idx"
ON "table_sessions" ("tableId")
WHERE "status" = 'open';

-- Additional white-label brand color slots on BusinessProfile
ALTER TABLE "business_profiles"
ADD COLUMN "brandAccentColor" TEXT,
ADD COLUMN "brandBackgroundColor" TEXT,
ADD COLUMN "brandTextColor" TEXT;
