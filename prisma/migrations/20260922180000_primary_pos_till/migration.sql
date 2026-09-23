-- Primary offline till (one per restaurant) + heartbeat fields for later sync guards.

ALTER TABLE "pos_tills" ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3);
ALTER TABLE "pos_tills" ADD COLUMN "pendingUploadCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "business_profiles" ADD COLUMN "primaryPosTillId" TEXT;

-- Backfill: oldest till per restaurant becomes primary when any tills exist.
UPDATE "business_profiles" AS bp
SET "primaryPosTillId" = (
  SELECT pt."id"
  FROM "pos_tills" AS pt
  WHERE pt."businessProfileId" = bp."id"
  ORDER BY pt."createdAt" ASC
  LIMIT 1
)
WHERE bp."primaryPosTillId" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "pos_tills" AS pt
    WHERE pt."businessProfileId" = bp."id"
  );

CREATE UNIQUE INDEX "business_profiles_primaryPosTillId_key" ON "business_profiles"("primaryPosTillId");

ALTER TABLE "business_profiles"
  ADD CONSTRAINT "business_profiles_primaryPosTillId_fkey"
  FOREIGN KEY ("primaryPosTillId")
  REFERENCES "pos_tills"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
