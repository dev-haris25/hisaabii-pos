-- Per-user in-app notifications + preference toggles
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "notifyZatca" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notifyHr" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notifySalesOps" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notifyTeam" BOOLEAN NOT NULL DEFAULT true;

-- Rebuild notifications as per-user inbox (drop legacy business-only rows)
DROP TABLE IF EXISTS "notifications";

CREATE TABLE "notifications" (
  "id" TEXT NOT NULL,
  "businessProfileId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "link" TEXT,
  "dedupeKey" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notifications_userId_dedupeKey_key" ON "notifications"("userId", "dedupeKey");
CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "notifications"("userId", "readAt", "createdAt");
CREATE INDEX "notifications_businessProfileId_createdAt_idx" ON "notifications"("businessProfileId", "createdAt");

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_businessProfileId_fkey"
  FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
