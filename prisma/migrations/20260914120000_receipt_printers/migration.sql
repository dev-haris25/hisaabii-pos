-- CreateTable
CREATE TABLE "receipt_printers" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 9100,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receipt_printers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "receipt_printers_businessProfileId_idx" ON "receipt_printers"("businessProfileId");

-- AddForeignKey
ALTER TABLE "receipt_printers" ADD CONSTRAINT "receipt_printers_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill the existing single printer onto the first row.
INSERT INTO "receipt_printers" ("id", "businessProfileId", "ip", "port", "sortOrder", "createdAt", "updatedAt")
SELECT
    CONCAT('rp_', "id"),
    "id",
    TRIM("printerIp"),
    COALESCE("printerPort", 9100),
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "business_profiles"
WHERE "printerIp" IS NOT NULL AND TRIM("printerIp") <> '';
