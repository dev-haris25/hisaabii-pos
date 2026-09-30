-- Soft-delete clears phone so the number can be reused (same pattern as
-- CouponCode.code). Postgres UNIQUE allows multiple NULLs.
-- Backfill existing soft-deleted rows that still hold a phone.

ALTER TABLE "loyalty_accounts" ALTER COLUMN "phone" DROP NOT NULL;

UPDATE "loyalty_accounts"
SET "phone" = NULL
WHERE "deletedAt" IS NOT NULL AND "phone" IS NOT NULL;
