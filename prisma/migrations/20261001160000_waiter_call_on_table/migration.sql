-- Move Call Waiter flags from TableSession onto Table (session-independent).

ALTER TABLE "tables"
ADD COLUMN "waiterCallRequestedAt" TIMESTAMP(3),
ADD COLUMN "waiterCallResolvedAt" TIMESTAMP(3);

CREATE INDEX "tables_businessProfileId_waiterCallRequestedAt_idx" ON "tables"("businessProfileId", "waiterCallRequestedAt");

DROP INDEX IF EXISTS "table_sessions_businessProfileId_waiterCallRequestedAt_idx";

ALTER TABLE "table_sessions"
DROP COLUMN IF EXISTS "waiterCallRequestedAt",
DROP COLUMN IF EXISTS "waiterCallResolvedAt";