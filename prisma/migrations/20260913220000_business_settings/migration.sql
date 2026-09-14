-- BusinessSettings for restaurant numbering + formats
CREATE TABLE IF NOT EXISTS "business_settings" (
  "businessProfileId" TEXT NOT NULL,
  "invoicePrefix" TEXT NOT NULL DEFAULT 'INV-',
  "creditNotePrefix" TEXT NOT NULL DEFAULT 'CN-',
  "debitNotePrefix" TEXT NOT NULL DEFAULT 'DN-',
  "salarySlipPrefix" TEXT NOT NULL DEFAULT 'SS-',
  "numberPadding" INTEGER NOT NULL DEFAULT 4,
  "dateFormat" TEXT NOT NULL DEFAULT 'dd/MM/yyyy',
  "numberFormat" TEXT NOT NULL DEFAULT '1,234.56',
  "defaultDocumentLanguage" TEXT NOT NULL DEFAULT 'ar',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "business_settings_pkey" PRIMARY KEY ("businessProfileId")
);

ALTER TABLE "business_settings"
  ADD CONSTRAINT "business_settings_businessProfileId_fkey"
  FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "business_settings" ("businessProfileId", "updatedAt")
SELECT "id", CURRENT_TIMESTAMP FROM "business_profiles"
ON CONFLICT ("businessProfileId") DO NOTHING;
