-- Per-till rear display and cash drawer (bound by local till id on the PC).
CREATE TABLE IF NOT EXISTS "pos_tills" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayEnabled" BOOLEAN NOT NULL DEFAULT true,
    "displayPort" TEXT,
    "displayBaud" INTEGER NOT NULL DEFAULT 9600,
    "displayProtocol" TEXT NOT NULL DEFAULT 'vfd_ascii',
    "drawerEnabled" BOOLEAN NOT NULL DEFAULT true,
    "drawerPort" TEXT,
    "drawerProtocol" TEXT NOT NULL DEFAULT 'escpos_pulse',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_tills_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "pos_tills_businessProfileId_idx" ON "pos_tills"("businessProfileId");

ALTER TABLE "pos_tills"
ADD CONSTRAINT "pos_tills_businessProfileId_fkey"
FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
