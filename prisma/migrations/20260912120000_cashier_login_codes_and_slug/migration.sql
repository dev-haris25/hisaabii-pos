-- AlterTable: restaurant slug (backfill existing rows)
ALTER TABLE "business_profiles" ADD COLUMN "slug" TEXT;

UPDATE "business_profiles"
SET "slug" = 'r-' || substr(md5(random()::text || "id"), 1, 8)
WHERE "slug" IS NULL;

ALTER TABLE "business_profiles" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "business_profiles_slug_key" ON "business_profiles"("slug");

-- AlterTable: cashier login codes replace per-restaurant PINs
DROP INDEX IF EXISTS "staff_businessProfileId_pinLookupHash_key";

ALTER TABLE "staff" DROP COLUMN IF EXISTS "pinHash";
ALTER TABLE "staff" DROP COLUMN IF EXISTS "pinLookupHash";

ALTER TABLE "staff" ADD COLUMN "loginCodeEnc" TEXT;
ALTER TABLE "staff" ADD COLUMN "loginCodeLookupHash" TEXT;

CREATE UNIQUE INDEX "staff_loginCodeLookupHash_key" ON "staff"("loginCodeLookupHash");
