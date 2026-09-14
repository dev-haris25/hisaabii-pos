-- Multi-restaurant: rename staff → users, add BusinessMembership + activeBusinessProfileId

-- Drop FKs that reference staff
ALTER TABLE "otp_codes" DROP CONSTRAINT IF EXISTS "otp_codes_staffId_fkey";
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_createdByStaffId_fkey";
ALTER TABLE "credit_notes" DROP CONSTRAINT IF EXISTS "credit_notes_createdByStaffId_fkey";
ALTER TABLE "debit_notes" DROP CONSTRAINT IF EXISTS "debit_notes_createdByStaffId_fkey";
ALTER TABLE "staff" DROP CONSTRAINT IF EXISTS "staff_businessProfileId_fkey";

-- Rename table staff → users
ALTER TABLE "staff" RENAME TO "users";

-- Rename primary key / unique indexes
ALTER INDEX IF EXISTS "staff_pkey" RENAME TO "users_pkey";
ALTER INDEX IF EXISTS "staff_email_key" RENAME TO "users_email_key";
ALTER INDEX IF EXISTS "staff_loginCodeLookupHash_key" RENAME TO "users_loginCodeLookupHash_key";
ALTER INDEX IF EXISTS "staff_businessProfileId_role_active_idx" RENAME TO "users_businessProfileId_role_active_idx";

-- Home restaurant FK (legacy pointer)
ALTER TABLE "users" ADD CONSTRAINT "users_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Active restaurant switch pointer
ALTER TABLE "users" ADD COLUMN "activeBusinessProfileId" TEXT;

CREATE INDEX "users_activeBusinessProfileId_idx" ON "users"("activeBusinessProfileId");

ALTER TABLE "users" ADD CONSTRAINT "users_activeBusinessProfileId_fkey" FOREIGN KEY ("activeBusinessProfileId") REFERENCES "business_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- otp_codes: staffId → userId
ALTER TABLE "otp_codes" RENAME COLUMN "staffId" TO "userId";
ALTER INDEX IF EXISTS "otp_codes_staffId_purpose_idx" RENAME TO "otp_codes_userId_purpose_idx";
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Re-point document createdBy FKs to users (column names unchanged)
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- BusinessMembership join table
CREATE TABLE "business_memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_memberships_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "business_memberships_businessProfileId_idx" ON "business_memberships"("businessProfileId");
CREATE UNIQUE INDEX "business_memberships_userId_businessProfileId_key" ON "business_memberships"("userId", "businessProfileId");

ALTER TABLE "business_memberships" ADD CONSTRAINT "business_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "business_memberships" ADD CONSTRAINT "business_memberships_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one membership per existing user + set activeBusinessProfileId
INSERT INTO "business_memberships" ("id", "userId", "businessProfileId", "role", "createdAt", "updatedAt")
SELECT
  'bm_' || "id",
  "id",
  "businessProfileId",
  "role",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "users"
ON CONFLICT DO NOTHING;

UPDATE "users"
SET "activeBusinessProfileId" = "businessProfileId"
WHERE "activeBusinessProfileId" IS NULL;
