-- AlterTable
ALTER TABLE "users" ADD COLUMN "productTourSeenAt" TIMESTAMP(3);

-- Existing accounts should not get the first-login tour modal on next visit.
-- New signups keep NULL until they start or skip the tour.
UPDATE "users" SET "productTourSeenAt" = CURRENT_TIMESTAMP WHERE "productTourSeenAt" IS NULL;
