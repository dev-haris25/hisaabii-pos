-- Step 7: idempotent desktop outbox event tracking
CREATE TABLE IF NOT EXISTS "sync_processed_events" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "posTillId" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_processed_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sync_processed_events_businessProfileId_eventId_key"
  ON "sync_processed_events"("businessProfileId", "eventId");

CREATE INDEX IF NOT EXISTS "sync_processed_events_businessProfileId_processedAt_idx"
  ON "sync_processed_events"("businessProfileId", "processedAt");

CREATE INDEX IF NOT EXISTS "sync_processed_events_posTillId_idx"
  ON "sync_processed_events"("posTillId");

DO $$ BEGIN
  ALTER TABLE "sync_processed_events"
    ADD CONSTRAINT "sync_processed_events_businessProfileId_fkey"
    FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "sync_processed_events"
    ADD CONSTRAINT "sync_processed_events_posTillId_fkey"
    FOREIGN KEY ("posTillId") REFERENCES "pos_tills"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
